import Link from "next/link";
import { SidebarInset } from "@/components/ui/sidebar";

const LAYERS = [
  {
    title: "1. Entrada",
    text: "Estações simuladas (uma por talhão) medem temperatura, umidade do ar, umidade do solo e luminosidade e marcam a chuva. O produtor envia fotos de folhas.",
  },
  {
    title: "2. Ingestão",
    text: "As estações publicam no broker MQTT (Mosquitto). O worker assina a telemetria, valida, descarta a leitura repetida e grava.",
  },
  {
    title: "3. Processamento",
    text: "A API de visão mede a área afetada (HSV) e identifica a praga. A cada hora, as últimas 24 h de cada talhão viram indicadores, como as horas de folha úmida.",
  },
  {
    title: "4. Automação",
    text: "O Jev avalia três riscos (doença fúngica, falta de água e calor) e escolhe a ação; regras de limiar assumem se ele falhar; um LLM escreve a recomendação quando o risco é alto.",
  },
  {
    title: "5. Saída",
    text: "Painéis de fotos e de ambiente, leituras ao vivo, histórico de decisões, relatório em PDF e exportação.",
  },
  {
    title: "6. Operação",
    text: "Novo na Sprint 7: pipeline DevSecOps a cada push, monitoramento (/api/health, /api/metrics e esta tela) e o event log que o pm4py analisa.",
  },
];

const COMPONENTS = [
  ["Simulador de estações", "Entrada", "Python + paho-mqtt", "Sprint 6"],
  ["Upload de fotos", "Entrada", "Next.js /upload", "Fases 2 e 4"],
  ["Broker MQTT", "Ingestão", "Eclipse Mosquitto 2.0.20", "Sprint 6"],
  [
    "Worker de ingestão e avaliador",
    "Ingestão e automação",
    "TypeScript (Node), Drizzle",
    "Sprint 6",
  ],
  ["API de visão", "Processamento", "FastAPI, OpenCV, VLM", "Fases 1 a 3"],
  ["Jev (System One)", "Automação", "OpenRouter", "Sprint 6"],
  ["Regras de limiar", "Automação", "TypeScript", "Sprint 6"],
  ["LLM de recomendação", "Automação", "OpenRouter", "Fase 5"],
  ["Banco de dados", "Armazenamento", "SQLite (WAL) + Drizzle", "Fase 2"],
  ["Painel web", "Saída", "Next.js 16, React 19, Recharts", "Fase 2"],
  ["Event log", "Operação", "JSONL gravado pelo worker", "Sprint 7"],
  [
    "Health, metrics e monitoramento",
    "Operação",
    "Rotas e tela do Next.js",
    "Sprint 7",
  ],
  ["Mineração de processos", "Operação", "pm4py", "Sprint 7"],
  [
    "Pipeline DevSecOps",
    "Operação",
    "GitHub Actions, Jenkins, SonarQube, Trivy",
    "Sprint 7",
  ],
];

const ORIGIN_CLASS: Record<string, string> = {
  // Mesmo azul do diagrama (#1d4ed8): o tema não tem um token azul.
  "Sprint 7": "py-1.5 font-semibold text-blue-700",
  "Sprint 6": "py-1.5 font-semibold text-agro-success",
};

export default function ArchitecturePage() {
  return (
    <SidebarInset className="bg-agro-bg">
      <div className="flex flex-1 flex-col gap-6 p-4 pb-24 sm:p-6 md:pb-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-agro-ink">
            Arquitetura final
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-agro-ink-2">
            Um núcleo em monólito modular (o app web) cercado por serviços
            satélites (API de visão, broker MQTT e worker), que dividem o mesmo
            banco. A Sprint 7 acrescenta a camada de operação: pipeline,
            monitoramento e event log.
          </p>
        </header>

        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
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
              src="/arquitetura/fluxo-final.png"
              alt="Fluxo de dados em seis camadas, da entrada à saída, com a camada de operação"
              className="w-full"
            />
            <figcaption className="mt-2 text-xs text-agro-ink-3">
              Fluxo de dados. Azul: novo na Sprint 7; verde: Sprint 6; cinza:
              fases anteriores.
            </figcaption>
          </figure>
          <div className="flex flex-col gap-4">
            <figure className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <img
                src="/arquitetura/implantacao.png"
                alt="Implantação: núcleo web, serviços satélites, pasta de dados compartilhada e healthchecks"
                className="w-full"
              />
              <figcaption className="mt-2 text-xs text-agro-ink-3">
                Implantação e monitoramento: o núcleo e os satélites dividem o
                banco; o worker grava o sinal de vida ao lado dele.
              </figcaption>
            </figure>
            <figure className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <img
                src="/arquitetura/pipeline.png"
                alt="Pipeline DevSecOps em cinco etapas, com o portão do Trivy e os artefatos"
                className="w-full"
              />
              <figcaption className="mt-2 text-xs text-agro-ink-3">
                Pipeline DevSecOps a cada push: build, testes, SonarQube,
                imagens com Trivy e execução ponta a ponta.
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
                          ORIGIN_CLASS[origin] ?? "py-1.5 text-agro-ink-2"
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
          {", "}
          <Link
            href="/ambiente/decisoes"
            className="font-semibold text-agro-success"
          >
            decisões
          </Link>
          {", "}
          <Link href="/ambiente" className="font-semibold text-agro-success">
            painel do ambiente
          </Link>
          {" e "}
          <Link
            href="/monitoramento"
            className="font-semibold text-agro-success"
          >
            monitoramento
          </Link>
          .
        </p>
      </div>
    </SidebarInset>
  );
}
