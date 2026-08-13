import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, MessageCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { whatsappSupportLink } from "@/lib/whatsapp";
import { isValidDocumento, maskDocumento, type TipoDocumento } from "@/lib/form-utils";
import {
  acessarSac,
  enviarCodigo,
  iniciarAcessoDocumento,
  solicitarLogin,
  verificarCodigo,
} from "@/lib/cliente-auth";
import type { CanaisDisponiveis, CanalCodigo, ContatosMascarados } from "@/lib/cliente-tipos";
import { cn } from "@/lib/utils";

const ERRO_CONEXAO = "Falha de conexão. Confira sua internet e tente novamente.";

/* ---------------- átomos de estilo (mesmo padrão de contract-form.tsx) ---------------- */

const inputCls = (error?: boolean) =>
  cn(
    "w-full rounded-lg border bg-muted/40 px-4 py-3 font-body text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2",
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-300/40"
      : "border-border focus:border-brand focus:ring-brand/30",
  );

const labelCls = (error?: boolean) =>
  cn("font-ui text-sm font-semibold transition", error ? "text-red-500" : "text-brand-deep");

function ErroBanner({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 font-body text-sm text-red-600"
    >
      <p>{mensagem}</p>
      <p className="mt-1 text-red-500">
        Precisa de ajuda?{" "}
        <a href={whatsappSupportLink()} className="font-semibold underline underline-offset-2">
          Falar com o atendimento
        </a>
      </p>
    </div>
  );
}

/** Botão de escolha no padrão do seletor de intenção do formulário de contratação. */
function EscolhaBotao({
  ativo,
  onClick,
  children,
  className,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-3 font-ui text-sm font-semibold leading-6 transition",
        ativo
          ? "border-brand bg-brand/10 text-brand-deep"
          : "border-border bg-white text-muted-foreground hover:border-brand/40 hover:text-brand-deep",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- canais ---------------- */

const CANAIS: { id: CanalCodigo; rotulo: string; Icone: typeof Mail }[] = [
  { id: "whatsapp", rotulo: "WhatsApp", Icone: MessageCircle },
  { id: "sms", rotulo: "SMS", Icone: Smartphone },
  { id: "email", rotulo: "E-mail", Icone: Mail },
];

/** Qual contato mascarado aparece embaixo de cada canal. */
function contatoDoCanal(canal: CanalCodigo, contatos: ContatosMascarados) {
  return canal === "email" ? contatos.email : contatos.celular;
}

/* ---------------- componente ---------------- */

type Etapa = "documento" | "canal" | "codigo";

export function ClienteLogin() {
  const navigate = useNavigate();

  // método 1
  const [etapa, setEtapa] = useState<Etapa>("documento");
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("cpf");
  const [documento, setDocumento] = useState("");
  const [documentoErro, setDocumentoErro] = useState(false);
  const [canais, setCanais] = useState<CanaisDisponiveis | null>(null);
  const [contatos, setContatos] = useState<ContatosMascarados>({});
  const [canalEscolhido, setCanalEscolhido] = useState<CanalCodigo | null>(null);
  const [codigo, setCodigo] = useState("");

  // método 2
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  // comuns
  const [enviando, setEnviando] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // diálogo de solicitação de login
  const [dialogoAberto, setDialogoAberto] = useState(false);

  function limparMensagens() {
    setErroServidor(null);
    setAviso(null);
  }

  function tratarFalha(mensagem: string) {
    setErroServidor(mensagem);
    toast.error(mensagem);
  }

  /** Login concluído: a sessão já está no cookie, basta ir para o painel. */
  function concluir(nome: string) {
    toast.success(`Bem-vindo, ${nome.split(" ")[0] ?? nome}!`);
    void navigate({ to: "/cliente/painel" });
  }

  /* -------- etapa 1 -------- */

  async function submeterDocumento(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    limparMensagens();

    if (!isValidDocumento(documento, tipoDocumento)) {
      setDocumentoErro(true);
      toast.error(tipoDocumento === "cpf" ? "Confira o CPF digitado." : "Confira o CNPJ digitado.");
      return;
    }

    setEnviando(true);
    try {
      const recaptchaToken = await getRecaptchaToken("cliente_documento");
      const resultado = await iniciarAcessoDocumento({
        data: { tipoDocumento, documento, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resultado.ok) {
        tratarFalha(resultado.mensagem);
        return;
      }

      setCanais(resultado.canais);
      setContatos(resultado.contatos);
      setEtapa("canal");
      if (resultado.mensagem) setAviso(resultado.mensagem);
    } catch (err) {
      console.error("Falha ao iniciar o acesso por documento", err);
      tratarFalha(ERRO_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  /* -------- etapa 2 -------- */

  async function escolherCanal(canal: CanalCodigo) {
    if (enviando) return;
    limparMensagens();
    setEnviando(true);
    try {
      const recaptchaToken = await getRecaptchaToken("cliente_envio_codigo");
      const resultado = await enviarCodigo({
        data: { metodo: canal, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resultado.ok) {
        tratarFalha(resultado.mensagem);
        return;
      }

      setCanalEscolhido(canal);
      setCodigo("");
      setEtapa("codigo");
      setAviso(resultado.mensagem ?? "Código enviado. Ele vale por poucos minutos.");
    } catch (err) {
      console.error("Falha ao enviar o código", err);
      tratarFalha(ERRO_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  /* -------- etapa 3 -------- */

  async function submeterCodigo(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    limparMensagens();

    if (codigo.replace(/\D/g, "").length < 4) {
      toast.error("Digite o código que você recebeu.");
      return;
    }

    setEnviando(true);
    try {
      const recaptchaToken = await getRecaptchaToken("cliente_verificacao_codigo");
      const resultado = await verificarCodigo({
        data: { codigo, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resultado.ok) {
        tratarFalha(resultado.mensagem);
        return;
      }

      concluir(resultado.nome);
    } catch (err) {
      console.error("Falha ao verificar o código", err);
      tratarFalha(ERRO_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  /* -------- método 2 -------- */

  async function submeterSac(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    limparMensagens();

    if (!login.trim() || !senha) {
      toast.error("Preencha login e senha.");
      return;
    }

    setEnviando(true);
    try {
      const recaptchaToken = await getRecaptchaToken("cliente_sac");
      const resultado = await acessarSac({
        data: { login: login.trim(), senha, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resultado.ok) {
        tratarFalha(resultado.mensagem);
        return;
      }

      concluir(resultado.nome);
    } catch (err) {
      console.error("Falha no acesso pelo SAC", err);
      tratarFalha(ERRO_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  /* -------- reinício -------- */

  function voltarParaDocumento() {
    limparMensagens();
    setEtapa("documento");
    setCanais(null);
    setContatos({});
    setCanalEscolhido(null);
    setCodigo("");
  }

  const canaisDisponiveis = canais ? CANAIS.filter((c) => canais[c.id]) : [];

  return (
    <>
      <div className="w-full rounded-2xl border border-border bg-white p-6 shadow-xl sm:p-8">
        <Tabs
          defaultValue="documento"
          onValueChange={() => {
            limparMensagens();
            setDocumentoErro(false);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documento" className="font-ui text-xs font-semibold sm:text-sm">
              Documento do cadastro
            </TabsTrigger>
            <TabsTrigger value="sac" className="font-ui text-xs font-semibold sm:text-sm">
              Login e senha SAC
            </TabsTrigger>
          </TabsList>

          {/* ---------------- método 1 ---------------- */}
          <TabsContent value="documento" className="mt-5">
            {etapa === "documento" && (
              <form onSubmit={(e) => void submeterDocumento(e)}>
                <p className="font-display text-xl font-extrabold text-brand-deep sm:text-2xl">
                  Acesse com seu documento
                </p>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Enviamos um código para confirmar que é você.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <span className={labelCls(documentoErro)}>Tipo de documento</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(["cpf", "cnpj"] as const).map((tipo) => (
                        <EscolhaBotao
                          key={tipo}
                          ativo={tipoDocumento === tipo}
                          onClick={() => {
                            setTipoDocumento(tipo);
                            setDocumento("");
                            setDocumentoErro(false);
                          }}
                        >
                          {tipo.toUpperCase()}
                        </EscolhaBotao>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls(documentoErro)} htmlFor="documento-cliente">
                      {tipoDocumento === "cpf" ? "CPF" : "CNPJ"}
                    </label>
                    <input
                      id="documento-cliente"
                      className={inputCls(documentoErro)}
                      value={documento}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={
                        tipoDocumento === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"
                      }
                      onChange={(e) => {
                        setDocumento(maskDocumento(e.target.value, tipoDocumento));
                        if (documentoErro) setDocumentoErro(false);
                      }}
                    />
                  </div>
                </div>

                {erroServidor && <ErroBanner mensagem={erroServidor} />}

                <Button
                  type="submit"
                  variant="zap"
                  size="xl"
                  className="mt-5 w-full"
                  disabled={enviando}
                >
                  {enviando && <Loader2 className="animate-spin" />}
                  {enviando ? "Verificando..." : "Acessar área do cliente"}
                </Button>
              </form>
            )}

            {etapa === "canal" && (
              <div>
                <button
                  type="button"
                  onClick={voltarParaDocumento}
                  className="mb-3 inline-flex items-center gap-1 font-ui text-sm font-semibold text-muted-foreground transition hover:text-brand-deep"
                >
                  <ArrowLeft className="size-4" /> Voltar
                </button>
                <p className="font-display text-xl font-extrabold text-brand-deep sm:text-2xl">
                  Onde quer receber o código?
                </p>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Escolha um dos contatos do seu cadastro.
                </p>

                <div className="mt-4 space-y-2">
                  {canaisDisponiveis.map(({ id, rotulo, Icone }) => {
                    const contato = contatoDoCanal(id, contatos);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={enviando}
                        onClick={() => void escolherCanal(id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-left transition hover:border-brand/40 disabled:opacity-60"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                          <Icone className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-ui text-sm font-semibold text-brand-deep">
                            {rotulo}
                          </span>
                          {contato && (
                            <span className="block truncate font-body text-xs text-muted-foreground">
                              {contato}
                            </span>
                          )}
                        </span>
                        {enviando && <Loader2 className="ml-auto size-4 animate-spin text-brand" />}
                      </button>
                    );
                  })}
                </div>

                {aviso && !erroServidor && (
                  <p className="mt-4 font-body text-sm text-muted-foreground">{aviso}</p>
                )}
                {erroServidor && <ErroBanner mensagem={erroServidor} />}
              </div>
            )}

            {etapa === "codigo" && (
              <form onSubmit={(e) => void submeterCodigo(e)}>
                <button
                  type="button"
                  onClick={() => {
                    limparMensagens();
                    setEtapa("canal");
                  }}
                  className="mb-3 inline-flex items-center gap-1 font-ui text-sm font-semibold text-muted-foreground transition hover:text-brand-deep"
                >
                  <ArrowLeft className="size-4" /> Trocar canal
                </button>
                <p className="font-display text-xl font-extrabold text-brand-deep sm:text-2xl">
                  Digite o código
                </p>
                {canalEscolhido && (
                  <p className="mt-1 font-body text-sm text-muted-foreground">
                    Enviado para {contatoDoCanal(canalEscolhido, contatos) ?? "seu contato"}.
                  </p>
                )}

                <div className="mt-4 space-y-1.5">
                  <label className={labelCls(false)} htmlFor="codigo-cliente">
                    Código de verificação
                  </label>
                  <input
                    id="codigo-cliente"
                    className={inputCls(false) + " text-center font-ui text-lg tracking-[0.4em]"}
                    value={codigo}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </div>

                {aviso && !erroServidor && (
                  <p className="mt-3 font-body text-sm text-muted-foreground">{aviso}</p>
                )}
                {erroServidor && <ErroBanner mensagem={erroServidor} />}

                <Button
                  type="submit"
                  variant="zap"
                  size="xl"
                  className="mt-5 w-full"
                  disabled={enviando}
                >
                  {enviando && <Loader2 className="animate-spin" />}
                  {enviando ? "Conferindo..." : "Entrar"}
                </Button>

                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => canalEscolhido && void escolherCanal(canalEscolhido)}
                  className="mt-3 w-full font-ui text-sm font-semibold text-brand transition hover:text-brand-deep disabled:opacity-60"
                >
                  Reenviar código
                </button>
              </form>
            )}
          </TabsContent>

          {/* ---------------- método 2 ---------------- */}
          <TabsContent value="sac" className="mt-5">
            <form onSubmit={(e) => void submeterSac(e)}>
              <p className="font-display text-xl font-extrabold text-brand-deep sm:text-2xl">
                Acesse com login e senha
              </p>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                As mesmas credenciais que você usa no SAC.
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className={labelCls(false)} htmlFor="login-cliente">
                    Login
                  </label>
                  <input
                    id="login-cliente"
                    className={inputCls(false)}
                    value={login}
                    autoComplete="username"
                    placeholder="seu login"
                    onChange={(e) => setLogin(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelCls(false)} htmlFor="senha-cliente">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="senha-cliente"
                      className={inputCls(false) + " pr-12"}
                      value={senha}
                      type={senhaVisivel ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="sua senha"
                      onChange={(e) => setSenha(e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setSenhaVisivel((v) => !v)}
                      className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground transition hover:text-brand-deep"
                    >
                      {senhaVisivel ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                </div>
              </div>

              {erroServidor && <ErroBanner mensagem={erroServidor} />}

              <Button
                type="submit"
                variant="zap"
                size="xl"
                className="mt-5 w-full"
                disabled={enviando}
              >
                {enviando && <Loader2 className="animate-spin" />}
                {enviando ? "Entrando..." : "Entrar"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  limparMensagens();
                  setDialogoAberto(true);
                }}
                className="mt-3 w-full font-ui text-sm font-semibold text-brand transition hover:text-brand-deep"
              >
                Esqueci meu login ou senha
              </button>
            </form>
          </TabsContent>
        </Tabs>
      </div>

      <SolicitarLoginDialog aberto={dialogoAberto} onFechar={() => setDialogoAberto(false)} />
    </>
  );
}

/* ---------------- diálogo: solicitar login e senha ---------------- */

function SolicitarLoginDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>("cpf");
  const [documento, setDocumento] = useState("");
  const [documentoErro, setDocumentoErro] = useState(false);
  const [metodo, setMetodo] = useState<"whatsapp" | "email">("whatsapp");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setSucesso(null);

    if (!isValidDocumento(documento, tipoDocumento)) {
      setDocumentoErro(true);
      toast.error(tipoDocumento === "cpf" ? "Confira o CPF digitado." : "Confira o CNPJ digitado.");
      return;
    }

    setEnviando(true);
    try {
      const recaptchaToken = await getRecaptchaToken("cliente_solicitacao_login");
      const resultado = await solicitarLogin({
        data: { tipoDocumento, documento, metodo, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resultado.ok) {
        setErro(resultado.mensagem);
        toast.error(resultado.mensagem);
        return;
      }

      const mensagem = resultado.mensagem ?? "Dados de acesso enviados.";
      setSucesso(mensagem);
      toast.success(mensagem);
    } catch (err) {
      console.error("Falha ao solicitar login e senha", err);
      setErro(ERRO_CONEXAO);
      toast.error(ERRO_CONEXAO);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => {
        if (!open) {
          setErro(null);
          setSucesso(null);
          onFechar();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-brand-deep">Receber login e senha</DialogTitle>
          <DialogDescription className="font-body">
            Enviamos seus dados de acesso para o contato do seu cadastro.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void submeter(e)} className="space-y-3">
          <div className="space-y-1.5">
            <span className={labelCls(documentoErro)}>Tipo de documento</span>
            <div className="grid grid-cols-2 gap-2">
              {(["cpf", "cnpj"] as const).map((tipo) => (
                <EscolhaBotao
                  key={tipo}
                  ativo={tipoDocumento === tipo}
                  onClick={() => {
                    setTipoDocumento(tipo);
                    setDocumento("");
                    setDocumentoErro(false);
                  }}
                >
                  {tipo.toUpperCase()}
                </EscolhaBotao>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls(documentoErro)} htmlFor="documento-solicitacao">
              {tipoDocumento === "cpf" ? "CPF" : "CNPJ"}
            </label>
            <input
              id="documento-solicitacao"
              className={inputCls(documentoErro)}
              value={documento}
              inputMode="numeric"
              autoComplete="off"
              placeholder={tipoDocumento === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
              onChange={(e) => {
                setDocumento(maskDocumento(e.target.value, tipoDocumento));
                if (documentoErro) setDocumentoErro(false);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <span className={labelCls(false)}>Receber por</span>
            <div className="grid grid-cols-2 gap-2">
              <EscolhaBotao ativo={metodo === "whatsapp"} onClick={() => setMetodo("whatsapp")}>
                WhatsApp
              </EscolhaBotao>
              <EscolhaBotao ativo={metodo === "email"} onClick={() => setMetodo("email")}>
                E-mail
              </EscolhaBotao>
            </div>
          </div>

          {erro && <ErroBanner mensagem={erro} />}
          {sucesso && !erro && (
            <p className="rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 font-body text-sm text-brand-deep">
              {sucesso}
            </p>
          )}

          <Button type="submit" variant="zap" size="xl" className="w-full" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />}
            {enviando ? "Enviando..." : "Enviar dados de acesso"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
