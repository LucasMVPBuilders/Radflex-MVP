export const CONTACT = {
  phoneDisplay: "(91) 99330-2323",
  phoneRaw: "5591993302323",
  responsavelTecnico: {
    nome: "Dr. Yuri Serruya",
    crm: "CRM 13841-PA",
    rqe: "RQE 9225",
  },
  domain: "radflexdiagnosticos.com.br",
  instagram: {
    handle: "@radflexlaudos",
    url: "https://instagram.com/radflexlaudos",
  },
} as const;

export const whatsappLink = (
  message = "Olá! Gostaria de saber mais sobre os serviços de telerradiologia da RadFlex.",
) => `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(message)}`;
