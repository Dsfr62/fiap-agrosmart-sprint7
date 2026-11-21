"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeriesPoint } from "@/shared/db/queries/environment";

interface FieldSeriesChartProps {
  options: { fieldId: string; label: string }[];
  series: Record<string, SeriesPoint[]>;
  defaultFieldId: string;
}

const chartConfig = {
  airHumidityPct: { label: "Umidade do ar (%)", color: "#166534" },
  temperatureC: { label: "Temperatura (°C)", color: "#5b5b63" },
  soilMoisturePct: { label: "Umidade do solo (%)", color: "#0e7490" },
} satisfies ChartConfig;

const formatHour = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
  });

export function FieldSeriesChart({
  options,
  series,
  defaultFieldId,
}: FieldSeriesChartProps) {
  const [fieldId, setFieldId] = useState(defaultFieldId);
  const data = series[fieldId] ?? [];

  return (
    <section className="rounded-2xl bg-agro-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="border-0 pb-0 text-lg font-semibold text-agro-ink">
            Últimas 48 h
          </h2>
          <p className="text-sm text-agro-ink-2">
            Média por hora. Acima de 90% de umidade do ar, a folha fica molhada
            e o fungo encontra condição para infectar; abaixo de 20% de umidade
            do solo, falta água para a planta.
          </p>
        </div>
        <Select value={fieldId} onValueChange={setFieldId}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Talhão">
            <SelectValue>
              {options.find((o) => o.fieldId === fieldId)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.fieldId} value={option.fieldId}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.length === 0 ? (
        <div className="mt-4 flex h-[260px] items-center justify-center rounded-xl border border-dashed border-agro-muted text-sm text-agro-ink-3">
          Sem leituras deste talhão nas últimas 48 h.
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="mt-4 aspect-auto h-[280px] w-full"
        >
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={formatHour}
            />
            <YAxis
              yAxisId="humidity"
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <YAxis
              yAxisId="temperature"
              orientation="right"
              domain={[0, 40]}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <ReferenceLine
              yAxisId="humidity"
              y={90}
              stroke="#bb271a"
              strokeDasharray="4 4"
              label={{
                value: "90%",
                position: "insideTopLeft",
                fill: "#bb271a",
                fontSize: 11,
              }}
            />
            <ReferenceLine
              yAxisId="humidity"
              y={20}
              stroke="#0e7490"
              strokeDasharray="4 4"
              label={{
                value: "20% solo",
                position: "insideBottomLeft",
                fill: "#0e7490",
                fontSize: 11,
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatHour(String(value))}
                  indicator="line"
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              yAxisId="humidity"
              type="monotone"
              dataKey="airHumidityPct"
              stroke="var(--color-airHumidityPct)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="humidity"
              type="monotone"
              dataKey="soilMoisturePct"
              stroke="var(--color-soilMoisturePct)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperatureC"
              stroke="var(--color-temperatureC)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
