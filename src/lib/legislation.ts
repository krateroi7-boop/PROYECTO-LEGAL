import type { ProvenanceDto } from "@/api/contracts";

export type Article = {
  id: string;
  number: string;
  title?: string;
  label?: string;
  type?: string;
  paragraphs: string[];
};

export type Law = {
  slug: string;
  type: string;
  number: string;
  title: string;
  shortTitle: string;
  status: "Vigente" | "Modificada" | "Derogada" | "Desconocida";
  published: string;
  updated: string;
  description: string;
  topics: string[];
  articles: Article[];
  versionId?: string;
  provenance?: ProvenanceDto;
};

export const laws: Law[] = [
  {
    slug: "ley-19880",
    type: "Ley",
    number: "19.880",
    title: "Establece bases de los procedimientos administrativos que rigen los actos de los órganos de la Administración del Estado",
    shortTitle: "Bases de los procedimientos administrativos",
    status: "Vigente",
    published: "29 de mayo de 2003",
    updated: "Última modificación: 20 de junio de 2024",
    description:
      "Regula las bases de los procedimientos administrativos de los órganos de la Administración del Estado y los derechos de las personas en sus relaciones con la Administración.",
    topics: ["Administración pública", "Procedimiento administrativo", "Transparencia"],
    articles: [
      {
        id: "articulo-1",
        number: "1°",
        title: "Ámbito de aplicación",
        paragraphs: [
          "La presente ley establece y regula las bases del procedimiento administrativo de los actos de la Administración del Estado.",
          "En caso de que la ley establezca procedimientos administrativos especiales, la presente ley se aplicará con carácter supletorio.",
        ],
      },
      {
        id: "articulo-2",
        number: "2°",
        title: "Concepto de acto administrativo",
        paragraphs: [
          "Para los efectos de esta ley se entiende por acto administrativo las decisiones formales que emitan los órganos de la Administración del Estado en las cuales se contienen declaraciones de voluntad, realizadas en el ejercicio de una potestad pública.",
        ],
      },
      {
        id: "articulo-3",
        number: "3°",
        title: "Principios generales",
        paragraphs: [
          "El procedimiento administrativo estará sometido a los principios de escrituración, gratuidad, celeridad, conclusivo, economía procedimental, contradictoriedad, imparcialidad, abstención, no formalización, inexcusabilidad, impugnabilidad, transparencia y publicidad.",
        ],
      },
      {
        id: "articulo-4",
        number: "4°",
        title: "Principio de escrituración",
        paragraphs: [
          "El procedimiento administrativo y los actos administrativos a los cuales da origen se expresarán por escrito o por medios electrónicos, a menos que su naturaleza exija o permita otra forma más adecuada de expresión y constancia.",
        ],
      },
    ],
  },
  {
    slug: "ley-19628",
    type: "Ley",
    number: "19.628",
    title: "Sobre protección de la vida privada",
    shortTitle: "Protección de la vida privada",
    status: "Modificada",
    published: "28 de agosto de 1999",
    updated: "Última modificación: 13 de diciembre de 2024",
    description:
      "Establece disposiciones para la protección y tratamiento de los datos de carácter personal y la vida privada de las personas.",
    topics: ["Datos personales", "Vida privada", "Derechos digitales"],
    articles: [
      {
        id: "articulo-1",
        number: "1°",
        title: "Objeto de la ley",
        paragraphs: [
          "El tratamiento de los datos de carácter personal en registros o bancos de datos por organismos públicos o por particulares se sujetará a las disposiciones de esta ley.",
        ],
      },
      {
        id: "articulo-2",
        number: "2°",
        title: "Definiciones",
        paragraphs: [
          "Para los efectos de esta ley se entenderá por datos de carácter personal o datos personales los relativos a cualquier información concerniente a personas naturales, identificadas o identificables.",
        ],
      },
    ],
  },
  {
    slug: "ley-20285",
    type: "Ley",
    number: "20.285",
    title: "Sobre acceso a la información pública",
    shortTitle: "Acceso a la información pública",
    status: "Vigente",
    published: "20 de agosto de 2008",
    updated: "Última modificación: 11 de julio de 2023",
    description:
      "Regula el principio de transparencia de la función pública, el derecho de acceso a la información de los órganos de la Administración y los procedimientos para ejercerlo.",
    topics: ["Transparencia", "Información pública", "Estado"],
    articles: [
      {
        id: "articulo-1",
        number: "1°",
        title: "Principio de transparencia",
        paragraphs: [
          "La función pública se ejerce con transparencia, de modo que permita y promueva el conocimiento de los procedimientos, contenidos y decisiones que se adopten en ejercicio de ella.",
        ],
      },
      {
        id: "articulo-2",
        number: "2°",
        title: "Aplicación",
        paragraphs: [
          "Las disposiciones de esta ley serán aplicables a los ministerios, las intendencias, las gobernaciones, los gobiernos regionales, las municipalidades y los demás órganos y servicios indicados en la ley.",
        ],
      },
    ],
  },
];

export function getLaw(slug: string) {
  return laws.find((law) => law.slug === slug);
}
