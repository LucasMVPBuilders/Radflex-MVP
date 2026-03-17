import React from "react";
import { CheckCircle2, XCircle, Clock, Loader2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DispatchItem } from "@/lib/dispatch/types";

interface DispatchProgressProps {
  items: DispatchItem[];
  isPaused: boolean;
  isRunning: boolean;
  sentCount: number;
  failedCount: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

const statusIcon = (status: DispatchItem["status"]) => {
  switch (status) {
    case "sent":
      return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    case "sending":
      return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
    case "cancelled":
      return <Ban className="h-4 w-4 text-muted-foreground shrink-0" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
};

const statusLabel: Record<DispatchItem["status"], string> = {
  pending: "Aguardando",
  sending: "Enviando...",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Pulado",
};

const DispatchRow = React.memo(({ item }: { item: DispatchItem }) => (
  <div className="flex items-center gap-2 px-2 py-1.5 rounded text-sm">
    {statusIcon(item.status)}
    <span className="flex-1 truncate">{item.lead.companyName}</span>
    <span className="text-xs text-muted-foreground shrink-0">
      {statusLabel[item.status]}
    </span>
    {item.error && (
      <span
        className="text-xs text-destructive truncate max-w-[140px]"
        title={item.error}
      >
        {item.error}
      </span>
    )}
  </div>
));
DispatchRow.displayName = "DispatchRow";

export function DispatchProgress({
  items,
  isPaused,
  isRunning,
  sentCount,
  failedCount,
  onPause,
  onResume,
  onCancel,
}: DispatchProgressProps) {
  const cancelledCount = items.filter((i) => i.status === "cancelled").length;
  const isDone = !isRunning && items.length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      {isRunning && (
        <div className="flex items-center gap-2">
          {isPaused ? (
            <Button size="sm" variant="outline" onClick={onResume}>
              Retomar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onPause}>
              Pausar
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={onCancel}>
            Cancelar
          </Button>
          <span className="text-sm text-muted-foreground">
            {isPaused ? "Pausado" : "Disparando..."}
          </span>
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-success font-medium">{sentCount} enviados</span>
          <span className="text-destructive font-medium">{failedCount} falhas</span>
          {cancelledCount > 0 && (
            <span className="text-muted-foreground">{cancelledCount} pulados</span>
          )}
          {isDone && (
            <span className="text-muted-foreground font-medium">— Concluído</span>
          )}
        </div>
      )}

      {/* Per-lead list */}
      <ScrollArea className="h-64 rounded border">
        <div className="p-2 space-y-1">
          {items.map((item) => (
            <DispatchRow key={item.lead.id} item={item} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
