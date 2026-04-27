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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      availability_requests: {
        Row: {
          blocked_shifts: string[] | null
          created_at: string
          created_by_manager_id: string | null
          date: string
          end_date: string | null
          id: string
          reason: string | null
          request_type: Database["public"]["Enums"]["availability_type"]
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_shifts?: string[] | null
          created_at?: string
          created_by_manager_id?: string | null
          date: string
          end_date?: string | null
          id?: string
          reason?: string | null
          request_type?: Database["public"]["Enums"]["availability_type"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_shifts?: string[] | null
          created_at?: string
          created_by_manager_id?: string | null
          date?: string
          end_date?: string | null
          id?: string
          reason?: string | null
          request_type?: Database["public"]["Enums"]["availability_type"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          calendar_token: string | null
          constraints: Json
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_responsible: boolean | null
          last_sync_generated_at: string | null
          role: string | null
          target_fte_percent: number
          updated_at: string
        }
        Insert: {
          calendar_token?: string | null
          constraints?: Json
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_responsible?: boolean | null
          last_sync_generated_at?: string | null
          role?: string | null
          target_fte_percent?: number
          updated_at?: string
        }
        Update: {
          calendar_token?: string | null
          constraints?: Json
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_responsible?: boolean | null
          last_sync_generated_at?: string | null
          role?: string | null
          target_fte_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      roster_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          shifts_data: Json
          version_name: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          shifts_data?: Json
          version_name: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          shifts_data?: Json
          version_name?: string
          week_start_date?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          assigned_user_id: string | null
          color_code: string | null
          comments: string | null
          created_at: string
          date: string
          end_time: string
          id: string
          is_draft: boolean
          is_responsible_on_shift: boolean
          is_standby: boolean
          is_verified: boolean
          manager_on_duty_id: string | null
          start_time: string
          type: Database["public"]["Enums"]["shift_type"]
          updated_at: string
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          assigned_user_id?: string | null
          color_code?: string | null
          comments?: string | null
          created_at?: string
          date: string
          end_time: string
          id?: string
          is_draft?: boolean
          is_responsible_on_shift?: boolean
          is_standby?: boolean
          is_verified?: boolean
          manager_on_duty_id?: string | null
          start_time: string
          type: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          assigned_user_id?: string | null
          color_code?: string | null
          comments?: string | null
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          is_draft?: boolean
          is_responsible_on_shift?: boolean
          is_standby?: boolean
          is_verified?: boolean
          manager_on_duty_id?: string | null
          start_time?: string
          type?: Database["public"]["Enums"]["shift_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_manager_on_duty_id_fkey"
            columns: ["manager_on_duty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_directory: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          claimed_by: string | null
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_claimed: boolean
          target_fte_percent: number
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id?: string
          is_claimed?: boolean
          target_fte_percent?: number
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_claimed?: boolean
          target_fte_percent?: number
        }
        Relationships: []
      }
      swap_requests: {
        Row: {
          covering_user_id: string | null
          created_at: string
          id: string
          is_pool_request: boolean
          is_take_only: boolean
          requesting_user_id: string
          shift_id: string
          status: Database["public"]["Enums"]["swap_status"]
          target_shift_id: string | null
          updated_at: string
        }
        Insert: {
          covering_user_id?: string | null
          created_at?: string
          id?: string
          is_pool_request?: boolean
          is_take_only?: boolean
          requesting_user_id: string
          shift_id: string
          status?: Database["public"]["Enums"]["swap_status"]
          target_shift_id?: string | null
          updated_at?: string
        }
        Update: {
          covering_user_id?: string | null
          created_at?: string
          id?: string
          is_pool_request?: boolean
          is_take_only?: boolean
          requesting_user_id?: string
          shift_id?: string
          status?: Database["public"]["Enums"]["swap_status"]
          target_shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_covering_user_id_fkey"
            columns: ["covering_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requesting_user_id_fkey"
            columns: ["requesting_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_target_shift_id_fkey"
            columns: ["target_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_overrides: {
        Row: {
          created_at: string
          id: string
          key: string
          locale: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          locale: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          locale?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "nurse" | "assistant" | "manager" | "assistant_manager"
      availability_type: "block" | "vacation"
      request_status: "pending" | "approved" | "declined"
      shift_type: "morning" | "evening" | "night"
      swap_status: "pending" | "peer_accepted" | "manager_approved" | "denied"
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
    Enums: {
      app_role: ["nurse", "assistant", "manager", "assistant_manager"],
      availability_type: ["block", "vacation"],
      request_status: ["pending", "approved", "declined"],
      shift_type: ["morning", "evening", "night"],
      swap_status: ["pending", "peer_accepted", "manager_approved", "denied"],
    },
  },
} as const
