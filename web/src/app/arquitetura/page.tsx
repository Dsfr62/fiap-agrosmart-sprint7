import Link from "next/link";
import { SidebarInset } from "@/components/ui/sidebar";

const LAYERS = [
  {
    title: "1 · Fontes de dados",
    text: "Estações simuladas (uma por talhão) medem temperatura, umidade do ar, umidade do solo e luminosidade e simulam chuva. O produtor envia fotos de folhas.",
  },
  {
    title: "2 · Ingestão",
    text: "As estações publicam no broker MQTT (Mosquitto). O worker assina a telemetria, valida, descarta duplicatas e grava.",
  },
  {
    title: "3 · Processamento",
    text: "A API de visão mede a área afetada (HSV) e identifica a praga (VLM). A cada hora, as últimas 24 h de cada talhão viram indicadores, como as horas de folha úmida a 15–25 °C.",
  },
  {
    title: "4 · Automação",
    text: "O Jev (System One) avalia três riscos (doença fúngica, estresse hídrico e térmico) e escolhe a ação, com probabilidades; regras de limiar assumem se ele falhar; um LLM escreve a recomendação de manejo quando o risco é alto.",
  },
  {
    title: "5 · Visualização",
    text: "Dashboards de fotos e de ambiente, leituras ao vivo e histórico de decisões, tudo no mesmo app.",
  },
];

const COMPONENTS = [
  ["Simulador de estações", "Fonte", "Python + paho-mqtt", "Fase 6"],
  ["Upload de fotos", "Fonte", "Next.js /upload", "Fases 2 e 4"],
  ["Broker MQTT", "Ingestão", "Eclipse Mosquitto 2.0.20", "Fase 6"],
  [
    "Worker de ingestão + avaliador",
    "Ingestão / Automação",
    "TypeScript (Node), Drizzle",
    "Fase 6",
  ],
  [
    "API de visão",
    "Processamento",
    "FastAPI, OpenCV, VLM via OpenRouter",
    "Fases 1 a 3",
  ],
  [
    "Jev (System One)",
    "Automação",
    "typesafe/jev-1.13 · OpenRouter Decisions API",
    "Fase 6",
  ],
  ["Regras de limiar", "Automação", "TypeScript", "Fase 6"],
  [
    "LLM de recomendação",
    "Automação",
    "OpenRouter (chat)",
    "Fase 5, estendido",
  ],
  [
    "Banco de dados",
    "Armazenamento",
    "SQLite (WAL) + Drizzle",
    "Fase 2, estendido",
  ],
  [
    "Dashboard web",
    "Visualização",
    "Next.js 16, React 19, Recharts",
    "Fase 2, estendido",
  ],
];

export default function ArchitecturePage() {
  return (
    <SidebarInset className="bg-agro-bg">
      <div className="flex flex-1 flex-col gap-6 p-4 pb-24 sm:p-6 md:pb-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-agro-ink">
            Arquitetura
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-agro-ink-2">
            Arquitetura baseada em serviços: um núcleo em monólito modular (o
            app web) cercado por serviços satélites (API de visão, broker MQTT e
            worker), que compartilham o mesmo banco.
          </p>
        </header>

        <section className="grid gap-2 md:grid-cols-5">
          {LAYERS.map((layer) => (
            <div
              key={layer.title}
              className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              <h2 className="border-0 pb-0 text-sm font-semibold text-agro-ink">
                {layer.title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-agro-ink-2">
                {layer.text}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[3fr_4fr]">
          <figure className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <img
              src="/arquitetura/fluxo-de-dados.png"
              alt="Fluxo de dados em cinco camadas, das estações e fotos ao dashboard"
              className="w-full"
            />
            <figcaption className="mt-2 text-xs text-agro-ink-3">
              Fluxo de dados. Verde: componentes novos da Fase 6; cinza: fases
              anteriores.
            </figcaption>
          </figure>
          <div className="flex flex-col gap-4">
            <figure className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <img
                src="/arquitetura/implantacao.png"
                alt="Visão de implantação: núcleo modular, serviços satélites e banco compartilhado"
                className="w-full"
              />
              <figcaption className="mt-2 text-xs text-agro-ink-3">
                Implantação: o núcleo web e os satélites gravam no mesmo SQLite.
              </figcaption>
            </figure>
            <div className="overflow-x-auto rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <table className="w-full text-left text-xs">
                <thead className="text-agro-ink-3">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Componente</th>
                    <th className="py-1 pr-3 font-semibold">Camada</th>
                    <th className="py-1 pr-3 font-semibold">Tecnologia</th>
                    <th className="py-1 font-semibold">Origem</th>
                  </tr>
                </thead>
                <tbody className="text-agro-ink">
                  {COMPONENTS.map(([name, layer, tech, origin]) => (
                    <tr key={name} className="border-t border-agro-separator">
                      <td className="py-1.5 pr-3 font-semibold">{name}</td>
                      <td className="py-1.5 pr-3">{layer}</td>
                      <td className="py-1.5 pr-3">{tech}</td>
                      <td
                        className={
                          origin === "Fase 6"
                            ? "py-1.5 font-semibold text-agro-success"
                            : "py-1.5 text-agro-ink-2"
                        }
                      >
                        {origin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <p className="text-sm text-agro-ink-2">
          Veja o sistema em funcionamento:{" "}
          <Link
            href="/ambiente/leituras"
            className="font-semibold text-agro-success"
          >
            leituras ao vivo
          </Link>
          {" → "}
          <Link
            href="/ambiente/decisoes"
            className="font-semibold text-agro-success"
          >
            decisões do Jev
          </Link>
          {" → "}
          <Link href="/ambiente" className="font-semibold text-agro-success">
            dashboard Ambiente
          </Link>
          .
        </p>
      </div>
    </SidebarInset>
  );
}
