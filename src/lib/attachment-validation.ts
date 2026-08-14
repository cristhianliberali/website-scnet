/**
 * Regras dos anexos da última etapa de /contratacao (comprovante de
 * residência e documento com foto), compartilhadas pelo formulário e pelo
 * servidor.
 *
 * O navegador aplica as mesmas regras para dar erro imediato ao cliente, mas
 * a validação que vale é a do servidor: a server function é um endpoint HTTP
 * comum e um atacante posta direto nela, sem passar pelo formulário. Por isso
 * nada que vem do cliente é aceito como verdade — nem o MIME declarado, nem o
 * tamanho informado, nem o nome do arquivo.
 */

export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

/** Extensões oferecidas no seletor de arquivo do navegador. */
export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg";

export const MAX_FILE_MB = 10;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Base64 cresce ~4/3 sobre o binário; a folga cobre o padding. */
export const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 16;

export const MAX_ANEXOS = 2;
export const MAX_FILENAME_LENGTH = 120;

/** Campos que o wizard realmente envia — qualquer outro é recusado. */
export const ANEXO_CAMPOS = ["comprovante_residencia", "documento_com_foto"] as const;
export type AnexoCampo = (typeof ANEXO_CAMPOS)[number];

/** A extensão do arquivo é reescrita a partir do MIME já verificado. */
const EXTENSION_BY_TYPE: Record<AcceptedType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Assinatura dos primeiros bytes de cada formato aceito. É o que impede que
 * um executável ou script renomeado para `.pdf` — e declarado como
 * `application/pdf` — seja repassado ao n8n.
 */
const MAGIC_BYTES: Record<AcceptedType, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export type RawAnexo = {
  campo: string;
  nome: string;
  tipo: string;
  tamanho: number;
  conteudo_base64: string;
};

/** Anexo reconstruído pelo servidor: nome saneado e tamanho recalculado. */
export type SafeAnexo = {
  campo: AnexoCampo;
  nome: string;
  tipo: AcceptedType;
  tamanho: number;
  conteudo_base64: string;
};

export type AnexoValidation = { ok: true; anexo: SafeAnexo } | { ok: false; error: string };

/** Bytes reais do conteúdo, derivados do base64 — o `tamanho` do cliente é ignorado. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

function hasMagicBytes(base64: string, tipo: AcceptedType): boolean {
  const expected = MAGIC_BYTES[tipo];
  // 4 chars de base64 = 3 bytes; 12 chars cobrem as 8 maiores assinaturas.
  const head = Buffer.from(base64.slice(0, 12), "base64");
  if (head.length < expected.length) return false;
  return expected.every((byte, i) => head[i] === byte);
}

/**
 * Reduz o nome enviado pelo cliente a algo seguro de gravar em disco.
 *
 * Fecha, de uma vez: path traversal (`../../var/www/shell.php`), dupla
 * extensão (`doc.pdf.exe`), caracteres de controle/NUL e as marcas bidi do
 * Unicode — usadas para exibir "exe.pdf" e gravar "fdp.exe". A extensão final
 * vem sempre do MIME verificado, nunca do texto original.
 */
export function sanitizeFilename(nome: string, tipo: AcceptedType): string {
  // Fica só com o último segmento, tratando "/" e "\" como separador.
  const lastSegment = nome.split(/[/\\]/).pop() ?? "";

  const base = lastSegment
    // Controle (inclui NUL, CR e LF) e marcas de direção de texto.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    // Só o que é seguro num nome de arquivo; o resto vira "-".
    .replace(/[^A-Za-z0-9À-ÿ._ -]/g, "-")
    // Remove a extensão original: ela é reescrita a partir do MIME.
    .replace(/\.[^.]*$/, "")
    // Um ponto sozinho ainda permitiria ".." depois dos cortes acima.
    .replace(/\./g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);

  const extension = EXTENSION_BY_TYPE[tipo];
  // Sobrou só pontuação (o caso de nomes como "../../..") — vale o nome padrão.
  const safeBase = /[A-Za-z0-9À-ÿ]/.test(base) ? base : "anexo";
  return `${safeBase}.${extension}`;
}

function isAcceptedType(value: string): value is AcceptedType {
  return (ACCEPTED_TYPES as readonly string[]).includes(value);
}

function isAnexoCampo(value: string): value is AnexoCampo {
  return (ANEXO_CAMPOS as readonly string[]).includes(value);
}

/**
 * Valida um anexo vindo do cliente e devolve a versão saneada que vai ao
 * webhook. As checagens baratas vêm antes da decodificação do base64.
 */
export function validateAnexo(raw: RawAnexo): AnexoValidation {
  if (!isAnexoCampo(raw.campo)) {
    return { ok: false, error: "Anexo não reconhecido." };
  }

  if (!isAcceptedType(raw.tipo)) {
    return { ok: false, error: "Use PDF, PNG ou JPEG." };
  }

  const base64 = raw.conteudo_base64;
  if (!base64 || base64.length % 4 !== 0 || !BASE64_RE.test(base64)) {
    return { ok: false, error: "Não conseguimos ler o arquivo enviado." };
  }

  const tamanho = base64ByteLength(base64);
  if (tamanho <= 0) {
    return { ok: false, error: "Não conseguimos ler o arquivo enviado." };
  }
  if (tamanho > MAX_FILE_BYTES) {
    return { ok: false, error: `Cada anexo deve ter no máximo ${MAX_FILE_MB}MB.` };
  }

  if (!hasMagicBytes(base64, raw.tipo)) {
    return { ok: false, error: "O arquivo não é um PDF, PNG ou JPEG válido." };
  }

  return {
    ok: true,
    anexo: {
      campo: raw.campo,
      nome: sanitizeFilename(raw.nome, raw.tipo),
      tipo: raw.tipo,
      tamanho,
      conteudo_base64: base64,
    },
  };
}

/** Valida a lista inteira; o primeiro erro interrompe e é o que volta ao cliente. */
export function validateAnexos(
  list: RawAnexo[],
): { ok: true; anexos: SafeAnexo[] } | { ok: false; error: string } {
  if (list.length > MAX_ANEXOS) {
    return { ok: false, error: `Envie no máximo ${MAX_ANEXOS} anexos.` };
  }

  const anexos: SafeAnexo[] = [];
  for (const raw of list) {
    const result = validateAnexo(raw);
    if (!result.ok) return { ok: false, error: result.error };
    anexos.push(result.anexo);
  }
  return { ok: true, anexos };
}
