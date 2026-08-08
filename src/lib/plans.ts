import { BookOpen, Globe, Rocket, Router, Wifi, Wrench, type LucideIcon } from "lucide-react";

export type PlanFeature = { icon: LucideIcon; text: string };
export type Plan = {
  name: string;
  price: string;
  desc: string;
  cta: string;
  featured?: boolean;
  features: PlanFeature[];
};

export const plans: Plan[] = [
  {
    name: "Plano 450",
    price: "109,90",
    desc: "Pra quem quer resolver o dia a dia sem drama: redes sociais, séries e trabalho leve, tudo rodando leve.",
    cta: "Quero este plano",
    features: [
      { icon: Globe, text: "Internet fibra óptica" },
      { icon: Wifi, text: "450 Mega de velocidade" },
      { icon: Router, text: "1x Roteador Wi-Fi 6 Incluso" },
      { icon: BookOpen, text: "App Skeelo" },
      { icon: Wrench, text: "Instalação gratuita*" },
    ],
  },
  {
    name: "Plano 710",
    price: "119,90",
    desc: "Casa com mais gente conectada ao mesmo tempo? Esse aguenta o tranco, aula online, chamada de vídeo e streaming juntos, sem travar.",
    cta: "Quero este plano",
    features: [
      { icon: Globe, text: "Internet fibra óptica" },
      { icon: Wifi, text: "710 Mega de velocidade" },
      { icon: Router, text: "1x Roteador Wi-Fi 6 Incluso" },
      { icon: BookOpen, text: "App Skeelo" },
      { icon: Wrench, text: "Instalação gratuita*" },
    ],
  },
  {
    name: "Plano Infinity",
    price: "139,90",
    desc: "Várias telas, jogo online, home office e streaming em 4K rodando ao mesmo tempo.",
    cta: "Quero este plano",
    featured: true,
    features: [
      { icon: Globe, text: "Internet fibra óptica" },
      { icon: Rocket, text: "Sem controle de velocidade" },
      { icon: Router, text: "1x Roteador Wi-Fi 6 Incluso" },
      { icon: BookOpen, text: "App Skeelo" },
      { icon: Wrench, text: "Instalação gratuita*" },
    ],
  },
  {
    name: "Plano Infinity Duo",
    price: "159,90",
    desc: "Ideal para residencias amplas e vários dispositivos conectados, possui 2 roteadores garantindo Wi-Fi em todos os comôdos.",
    cta: "Quero este plano",
    features: [
      { icon: Globe, text: "Internet fibra óptica" },
      { icon: Rocket, text: "Sem controle de velocidade" },
      { icon: Router, text: "2x Roteadores Wi-Fi 6 Inclusos" },
      { icon: BookOpen, text: "App Skeelo" },
      { icon: Wrench, text: "Instalação R$ 100,00 (taxa única)*" },
    ],
  },
];
