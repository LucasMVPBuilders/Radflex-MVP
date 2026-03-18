export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      cnae_filters: {
        Row: {
          id: string
          code: string
          short_name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          short_name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          short_name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          company_name: string | null
          cnae_code: string | null
          faturamento_est: number | null
          uf: string | null
          status: string | null
          raw: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          company_name?: string | null
          cnae_code?: string | null
          faturamento_est?: number | null
          uf?: string | null
          status?: string | null
          raw?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          company_name?: string | null
          cnae_code?: string | null
          faturamento_est?: number | null
          uf?: string | null
          status?: string | null
          raw?: Json | null
          created_at?: string | null
        }
      }
      message_templates: {
        Row: {
          id: string
          name: string
          channel: string
          subject: string | null
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          channel: string
          subject?: string | null
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          channel?: string
          subject?: string | null
          body?: string
          created_at?: string
          updated_at?: string
        }
      }
      dispatch_logs: {
        Row: {
          id: string
          template_id: string | null
          lead_id: string
          lead_snapshot: Json | null
          channel: string
          status: string
          error_msg: string | null
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          template_id?: string | null
          lead_id: string
          lead_snapshot?: Json | null
          channel: string
          status?: string
          error_msg?: string | null
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string | null
          lead_id?: string
          lead_snapshot?: Json | null
          channel?: string
          status?: string
          error_msg?: string | null
          sent_at?: string | null
          created_at?: string
        }
      }
      pipeline_stages: {
        Row: {
          id: string
          key: string
          name: string
          position: number
          color: string | null
          is_system: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          position: number
          color?: string | null
          is_system?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          position?: number
          color?: string | null
          is_system?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      pipeline_leads: {
        Row: {
          id: string
          lead_id: string
          dispatch_log_id: string | null
          current_stage_id: string
          primary_channel: string
          contact_phone: string | null
          contact_email: string | null
          latest_message_preview: string | null
          latest_message_at: string | null
          latest_direction: string | null
          unread_count: number
          lead_snapshot: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          dispatch_log_id?: string | null
          current_stage_id: string
          primary_channel: string
          contact_phone?: string | null
          contact_email?: string | null
          latest_message_preview?: string | null
          latest_message_at?: string | null
          latest_direction?: string | null
          unread_count?: number
          lead_snapshot: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          dispatch_log_id?: string | null
          current_stage_id?: string
          primary_channel?: string
          contact_phone?: string | null
          contact_email?: string | null
          latest_message_preview?: string | null
          latest_message_at?: string | null
          latest_direction?: string | null
          unread_count?: number
          lead_snapshot?: Json
          created_at?: string
          updated_at?: string
        }
      }
      conversation_messages: {
        Row: {
          id: string
          pipeline_lead_id: string
          channel: string
          direction: string
          provider_message_id: string | null
          body: string
          status: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          pipeline_lead_id: string
          channel: string
          direction: string
          provider_message_id?: string | null
          body: string
          status?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          pipeline_lead_id?: string
          channel?: string
          direction?: string
          provider_message_id?: string | null
          body?: string
          status?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
