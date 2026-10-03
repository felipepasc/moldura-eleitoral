export type Party = {
  acronym: string;
  name: string;
  number: string;
  colors: { primary: string; secondary: string; accent: string };
  colorsEstimated: boolean;
  // Partido de duas cores: secondary e accent são iguais de propósito (ex.: Missão, amarelo e preto).
  twoColor?: true;
};

// Só dados públicos: sigla, nome, número e cores (nenhum logotipo é copiado).
// Fontes: sites oficiais dos partidos e Wikipédia (modelos de cor), consultados em 03/10/2026.
// colorsEstimated = true quando o hex não veio de um manual de identidade (a maioria);
// PV e PCB não tiveram hex verificado e usam valores razoáveis. Conferir antes de publicar.
// União Brasil (44) e PP (11) formam a federação União Progressista, mas mantêm nome e número próprios.
export const PARTIES: readonly Party[] = [
  {
    acronym: "PT",
    name: "Partido dos Trabalhadores",
    number: "13",
    colors: { primary: "#e20e28", secondary: "#ffffff", accent: "#7a0715" },
    colorsEstimated: true,
  },
  {
    acronym: "PL",
    name: "Partido Liberal",
    number: "22",
    colors: { primary: "#015aaa", secondary: "#ffdf00", accent: "#009c3b" },
    colorsEstimated: true,
  },
  {
    acronym: "UNIÃO",
    name: "União Brasil",
    number: "44",
    colors: { primary: "#0b3d91", secondary: "#ffd400", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PP",
    name: "Progressistas",
    number: "11",
    colors: { primary: "#203f71", secondary: "#ffffff", accent: "#7fa6db" },
    colorsEstimated: true,
  },
  {
    acronym: "MDB",
    name: "Movimento Democrático Brasileiro",
    number: "15",
    colors: { primary: "#30914d", secondary: "#ffcc00", accent: "#c8102e" },
    colorsEstimated: true,
  },
  {
    acronym: "PSD",
    name: "Partido Social Democrático",
    number: "55",
    colors: { primary: "#022a59", secondary: "#ffa500", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "REPUBLICANOS",
    name: "Republicanos",
    number: "10",
    colors: { primary: "#0070c5", secondary: "#ffffff", accent: "#0b2f57" },
    colorsEstimated: true,
  },
  {
    acronym: "PSB",
    name: "Partido Socialista Brasileiro",
    number: "40",
    colors: { primary: "#c41d23", secondary: "#ffcc00", accent: "#066aab" },
    colorsEstimated: true,
  },
  {
    acronym: "PDT",
    name: "Partido Democrático Trabalhista",
    number: "12",
    colors: { primary: "#c21e56", secondary: "#1f3a93", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PSDB",
    name: "Partido da Social Democracia Brasileira",
    number: "45",
    colors: { primary: "#004997", secondary: "#ffcc01", accent: "#0080ff" },
    colorsEstimated: true,
  },
  {
    acronym: "NOVO",
    name: "Partido Novo",
    number: "30",
    colors: { primary: "#ef5a23", secondary: "#1a2948", accent: "#fdc908" },
    colorsEstimated: true,
  },
  {
    acronym: "PSOL",
    name: "Partido Socialismo e Liberdade",
    number: "50",
    colors: { primary: "#ffc200", secondary: "#000000", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PCdoB",
    name: "Partido Comunista do Brasil",
    number: "65",
    colors: { primary: "#e42026", secondary: "#035299", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PODE",
    name: "Podemos",
    number: "20",
    colors: { primary: "#6b2fb3", secondary: "#16a34a", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "CIDADANIA",
    name: "Cidadania",
    number: "23",
    colors: { primary: "#ca0088", secondary: "#0e223b", accent: "#24c7b1" },
    colorsEstimated: true,
  },
  {
    acronym: "REDE",
    name: "Rede Sustentabilidade",
    number: "18",
    colors: { primary: "#3ca08c", secondary: "#f85a23", accent: "#ffc323" },
    colorsEstimated: true,
  },
  {
    acronym: "PV",
    name: "Partido Verde",
    number: "43",
    colors: { primary: "#00923f", secondary: "#ffdd00", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "AVANTE",
    name: "Avante",
    number: "70",
    colors: { primary: "#d27901", secondary: "#67a4ad", accent: "#423f40" },
    colorsEstimated: true,
  },
  {
    acronym: "SOLIDARIEDADE",
    name: "Solidariedade",
    number: "77",
    colors: { primary: "#f37021", secondary: "#293b97", accent: "#ffffff" },
    colorsEstimated: false,
  },
  {
    acronym: "PRD",
    name: "Partido Renovação Democrática",
    number: "25",
    colors: { primary: "#026fc2", secondary: "#007c3c", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "MISSÃO",
    name: "Partido Missão",
    number: "14",
    // Amarelo e preto (onça do mascote); o amarelo vem da pesquisa (pt.wikipedia / CSS de missao.org.br).
    colors: { primary: "#fdbf35", secondary: "#000000", accent: "#000000" },
    colorsEstimated: true,
    twoColor: true,
  },
  {
    acronym: "DC",
    name: "Democracia Cristã",
    number: "27",
    colors: { primary: "#1e40af", secondary: "#ffde00", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "MOBILIZA",
    name: "Mobiliza (ex-PMN, Mobilização Nacional)",
    number: "33",
    colors: { primary: "#da010a", secondary: "#000000", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PCO",
    name: "Partido da Causa Operária",
    number: "29",
    colors: { primary: "#ce1920", secondary: "#fbe919", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PSTU",
    name: "Partido Socialista dos Trabalhadores Unificado",
    number: "16",
    colors: { primary: "#cc0000", secondary: "#ffffff", accent: "#900000" },
    colorsEstimated: true,
  },
  {
    acronym: "UP",
    name: "Unidade Popular",
    number: "80",
    colors: { primary: "#c00810", secondary: "#18181b", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "PCB",
    name: "Partido Comunista Brasileiro",
    number: "21",
    colors: { primary: "#b71c1c", secondary: "#e6ce2e", accent: "#ffffff" },
    colorsEstimated: true,
  },
  {
    acronym: "AGIR",
    name: "Agir",
    number: "36",
    colors: { primary: "#0033a1", secondary: "#ffffff", accent: "#0071ce" },
    colorsEstimated: true,
  },
  {
    acronym: "DEMOCRATA",
    name: "Democrata (ex-PMB, Partido da Mulher Brasileira)",
    number: "35",
    colors: { primary: "#0049af", secondary: "#ffffff", accent: "#f5c400" },
    colorsEstimated: true,
  },
];

export function findParty(acronym: string): Party | undefined {
  return PARTIES.find((party) => party.acronym === acronym);
}
