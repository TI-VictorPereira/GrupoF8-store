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
      ajustes_estoque: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          motivo: string
          produto_id: string
          quantidade: number
          tipo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          motivo: string
          produto_id: string
          quantidade: number
          tipo: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          motivo?: string
          produto_id?: string
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_estoque_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      almocos: {
        Row: {
          codigo_barras: string
          colaborador_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          criado_em: string
          expira_em: string
          id: string
          origem: Database["public"]["Enums"]["almoco_origem"]
          status: Database["public"]["Enums"]["almoco_status"]
        }
        Insert: {
          codigo_barras: string
          colaborador_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          criado_em?: string
          expira_em: string
          id?: string
          origem?: Database["public"]["Enums"]["almoco_origem"]
          status?: Database["public"]["Enums"]["almoco_status"]
        }
        Update: {
          codigo_barras?: string
          colaborador_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          criado_em?: string
          expira_em?: string
          id?: string
          origem?: Database["public"]["Enums"]["almoco_origem"]
          status?: Database["public"]["Enums"]["almoco_status"]
        }
        Relationships: [
          {
            foreignKeyName: "almocos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almocos_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_produto: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      departamentos: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      itens_pedido: {
        Row: {
          categoria: string | null
          custo_unitario: number
          id: string
          nome_produto: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
        }
        Insert: {
          categoria?: string | null
          custo_unitario: number
          id?: string
          nome_produto: string
          pedido_id: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
        }
        Update: {
          categoria?: string | null
          custo_unitario?: number
          id?: string
          nome_produto?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      log_auditoria: {
        Row: {
          acao: string
          criado_em: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cancelado_em: string | null
          codigo_retirada: string
          colaborador_id: string
          criado_em: string
          entregue_em: string | null
          entregue_por: string | null
          id: string
          motivo_cancelamento: string | null
          status: Database["public"]["Enums"]["pedido_status"]
          valor_total: number
        }
        Insert: {
          cancelado_em?: string | null
          codigo_retirada: string
          colaborador_id: string
          criado_em?: string
          entregue_em?: string | null
          entregue_por?: string | null
          id?: string
          motivo_cancelamento?: string | null
          status?: Database["public"]["Enums"]["pedido_status"]
          valor_total?: number
        }
        Update: {
          cancelado_em?: string | null
          codigo_retirada?: string
          colaborador_id?: string
          criado_em?: string
          entregue_em?: string | null
          entregue_por?: string | null
          id?: string
          motivo_cancelamento?: string | null
          status?: Database["public"]["Enums"]["pedido_status"]
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_entregue_por_fkey"
            columns: ["entregue_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          codigo: string
          criado_em: string
          custo: number
          estoque: number
          foto_url: string | null
          id: string
          nome: string
          preco_venda: number
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          codigo: string
          criado_em?: string
          custo?: number
          estoque?: number
          foto_url?: string | null
          id?: string
          nome: string
          preco_venda?: number
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          codigo?: string
          criado_em?: string
          custo?: number
          estoque?: number
          foto_url?: string | null
          id?: string
          nome?: string
          preco_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_produto"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          departamento_id: string | null
          empresa: string
          id: string
          matricula: string | null
          nome_completo: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          senha_provisoria: boolean
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          departamento_id?: string | null
          empresa?: string
          id: string
          matricula?: string | null
          nome_completo: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          senha_provisoria?: boolean
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          departamento_id?: string | null
          empresa?: string
          id?: string
          matricula?: string | null
          nome_completo?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          senha_provisoria?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_senha: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          codigo: string
          criado_em: string
          id: string
          nome_informado: string | null
          status: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          codigo: string
          criado_em?: string
          id?: string
          nome_informado?: string | null
          status?: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          codigo?: string
          criado_em?: string
          id?: string
          nome_informado?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_senha_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tentativas_login: {
        Row: {
          bloqueado_ate: string | null
          codigo: string
          tentativas: number
        }
        Insert: {
          bloqueado_ate?: string | null
          codigo: string
          tentativas?: number
        }
        Update: {
          bloqueado_ate?: string | null
          codigo?: string
          tentativas?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ajustar_estoque: {
        Args: {
          p_motivo: string
          p_produto_id: string
          p_quantidade: number
          p_tipo: string
        }
        Returns: {
          ativo: boolean
          categoria_id: string | null
          codigo: string
          criado_em: string
          custo: number
          estoque: number
          foto_url: string | null
          id: string
          nome: string
          preco_venda: number
        }
        SetofOptions: {
          from: "*"
          to: "produtos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: {
          cancelado_em: string | null
          codigo_retirada: string
          colaborador_id: string
          criado_em: string
          entregue_em: string | null
          entregue_por: string | null
          id: string
          motivo_cancelamento: string | null
          status: Database["public"]["Enums"]["pedido_status"]
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirmar_almoco: {
        Args: { p_codigo_barras: string }
        Returns: {
          codigo_barras: string
          colaborador_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          criado_em: string
          expira_em: string
          id: string
          origem: Database["public"]["Enums"]["almoco_origem"]
          status: Database["public"]["Enums"]["almoco_status"]
        }
        SetofOptions: {
          from: "*"
          to: "almocos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      data_utc: { Args: { p_ts: string }; Returns: string }
      eh_admin: { Args: never; Returns: boolean }
      eh_refeitorio_ou_admin: { Args: never; Returns: boolean }
      finalizar_pedido: {
        Args: { p_itens: Json }
        Returns: {
          cancelado_em: string | null
          codigo_retirada: string
          colaborador_id: string
          criado_em: string
          entregue_em: string | null
          entregue_por: string | null
          id: string
          motivo_cancelamento: string | null
          status: Database["public"]["Enums"]["pedido_status"]
          valor_total: number
        }
        SetofOptions: {
          from: "*"
          to: "pedidos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gerar_almoco: {
        Args: { p_validade_minutos?: number }
        Returns: {
          codigo_barras: string
          colaborador_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          criado_em: string
          expira_em: string
          id: string
          origem: Database["public"]["Enums"]["almoco_origem"]
          status: Database["public"]["Enums"]["almoco_status"]
        }
        SetofOptions: {
          from: "*"
          to: "almocos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_almoco_manual: {
        Args: { p_colaborador_id: string }
        Returns: {
          codigo_barras: string
          colaborador_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          criado_em: string
          expira_em: string
          id: string
          origem: Database["public"]["Enums"]["almoco_origem"]
          status: Database["public"]["Enums"]["almoco_status"]
        }
        SetofOptions: {
          from: "*"
          to: "almocos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      almoco_origem: "totem" | "manual"
      almoco_status: "pendente" | "confirmado" | "expirado" | "cancelado"
      papel_usuario: "colaborador" | "refeitorio" | "admin"
      pedido_status: "pendente" | "entregue" | "cancelado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      almoco_origem: ["totem", "manual"],
      almoco_status: ["pendente", "confirmado", "expirado", "cancelado"],
      papel_usuario: ["colaborador", "refeitorio", "admin"],
      pedido_status: ["pendente", "entregue", "cancelado"],
    },
  },
} as const
