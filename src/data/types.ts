export interface Lead {
  id: string;
  companyName: string;
  cnae: string;
  estimatedRevenue: number;
  city: string;
  state: string;
  phone: string;
  email: string;
  status: "new" | "found" | "exported";
  cnpj: string;
  website?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
}

export interface CnaeCode {
  code: string;
  description: string;
  shortName: string;
}

export interface Filters {
  cnaes: string[];
  states: string[];
  revenueMin: number;
  revenueMax: number;
  search: string;
}
