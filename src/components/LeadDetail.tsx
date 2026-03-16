import { Lead } from "@/data/types";
import { X, Mail, Phone, Building2, MapPin, Hash, DollarSign, Globe, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface LeadDetailProps {
  lead: Lead | null;
  onClose: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export const LeadDetail = ({ lead, onClose }: LeadDetailProps) => {
  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-96 bg-card border-l border-border z-50 shadow-xl overflow-y-auto"
          >
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-lg text-foreground">Detalhes do Lead</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Company */}
              <div>
                <h3 className="text-xl font-semibold text-foreground">{lead.companyName}</h3>
                {lead.cnpj && <p className="text-sm text-muted-foreground mt-1 font-mono-data">{lead.cnpj}</p>}
                {lead.rating != null && (
                  <div className="flex items-center gap-1 mt-1 text-sm text-yellow-500">
                    <Star className="h-3.5 w-3.5 fill-yellow-500" />
                    <span>{lead.rating.toFixed(1)}</span>
                    {lead.reviewsCount != null && (
                      <span className="text-muted-foreground text-xs">({lead.reviewsCount} avaliações)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Revenue */}
              <div className="bg-success/10 rounded p-4">
                <div className="flex items-center gap-2 text-success text-sm font-medium mb-1">
                  <DollarSign className="h-4 w-4" />
                  Faturamento Estimado
                </div>
                <div className="text-2xl font-bold text-success">{formatCurrency(lead.estimatedRevenue)}</div>
              </div>

              {/* Info Grid */}
              <div className="space-y-4">
                <InfoRow icon={<Hash className="h-4 w-4" />} label="CNAE" value={lead.cnae} mono />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Localização" value={lead.address || `${lead.city}, ${lead.state}`} />
                {lead.cnpj && <InfoRow icon={<Building2 className="h-4 w-4" />} label="CNPJ" value={lead.cnpj} mono />}
                {lead.phone && <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={lead.phone} />}
                {lead.email && <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email} />}
                {lead.website && (
                  <div className="flex items-start gap-3">
                    <div className="text-muted-foreground mt-0.5"><Globe className="h-4 w-4" /></div>
                    <div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Website</div>
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.website}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button className="w-full">Exportar para CRM</Button>
                <Button variant="outline" className="w-full">
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar Email
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const InfoRow = ({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  mono?: boolean;
}) => (
  <div className="flex items-start gap-3">
    <div className="text-muted-foreground mt-0.5">{icon}</div>
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm text-foreground ${mono ? "font-mono-data" : ""}`}>{value || '—'}</div>
    </div>
  </div>
);
