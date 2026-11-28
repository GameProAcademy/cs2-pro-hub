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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      adaptive_training_plan_versions: {
        Row: {
          content: Json
          created_at: string
          diff: Json | null
          id: string
          method_version: string
          plan_id: string
          reason: string
          user_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          diff?: Json | null
          id?: string
          method_version: string
          plan_id: string
          reason: string
          user_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          diff?: Json | null
          id?: string
          method_version?: string
          plan_id?: string
          reason?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "adaptive_training_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "adaptive_training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      adaptive_training_plans: {
        Row: {
          active_version: number
          closed_at: string | null
          created_at: string
          horizon: number
          id: string
          pause_reason: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_version?: number
          closed_at?: string | null
          created_at?: string
          horizon: number
          id?: string
          pause_reason?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_version?: number
          closed_at?: string | null
          created_at?: string
          horizon?: number
          id?: string
          pause_reason?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      adaptive_training_sessions: {
        Row: {
          area: string
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          exercise_id: string
          id: string
          minutes: number
          note: string | null
          plan_id: string
          scheduled_on: string
          session_index: number
          status: string
          user_id: string
          version: number
        }
        Insert: {
          area: string
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          exercise_id: string
          id?: string
          minutes: number
          note?: string | null
          plan_id: string
          scheduled_on: string
          session_index: number
          status?: string
          user_id: string
          version: number
        }
        Update: {
          area?: string
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          exercise_id?: string
          id?: string
          minutes?: number
          note?: string | null
          plan_id?: string
          scheduled_on?: string
          session_index?: number
          status?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "adaptive_training_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "adaptive_training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          analysis_version: string
          confidence: number | null
          created_at: string
          id: string
          player_id: string
          source_upload_id: string | null
          status: Database["public"]["Enums"]["analysis_status"]
          summary: string | null
        }
        Insert: {
          analysis_version?: string
          confidence?: number | null
          created_at?: string
          id?: string
          player_id: string
          source_upload_id?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          summary?: string | null
        }
        Update: {
          analysis_version?: string
          confidence?: number | null
          created_at?: string
          id?: string
          player_id?: string
          source_upload_id?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_findings: {
        Row: {
          analysis_id: string
          confidence: number | null
          created_at: string
          description: string | null
          evidence: Json | null
          id: string
          impact: string | null
          priority: Database["public"]["Enums"]["finding_priority"] | null
          skill_id: string | null
          title: string
          type: Database["public"]["Enums"]["finding_type"]
        }
        Insert: {
          analysis_id: string
          confidence?: number | null
          created_at?: string
          description?: string | null
          evidence?: Json | null
          id?: string
          impact?: string | null
          priority?: Database["public"]["Enums"]["finding_priority"] | null
          skill_id?: string | null
          title: string
          type: Database["public"]["Enums"]["finding_type"]
        }
        Update: {
          analysis_id?: string
          confidence?: number | null
          created_at?: string
          description?: string | null
          evidence?: Json | null
          id?: string
          impact?: string | null
          priority?: Database["public"]["Enums"]["finding_priority"] | null
          skill_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["finding_type"]
        }
        Relationships: [
          {
            foreignKeyName: "analysis_findings_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_findings_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_mapping_inventory: {
        Row: {
          canonical_authorization: boolean
          canonical_field: string
          created_at: string
          depends_on_full_tick_domain: boolean
          determinism_status: string
          empty_string_semantics: string
          event_evidence: Json
          evidence_class: string
          evidence_digest: string
          false_semantics: string
          identity_requirement: string
          last_verified_at: string | null
          mapping_status: string
          missing_semantics: string
          normalization: string
          normalization_executed: boolean
          null_semantics: string
          parity_status: string
          parser_api: string
          python_evidence: Json
          review_status: string
          semantic_mismatch: boolean
          source_capability: string
          source_field: string
          updated_at: string
          wasm_evidence: Json
          zero_semantics: string
        }
        Insert: {
          canonical_authorization?: boolean
          canonical_field: string
          created_at?: string
          depends_on_full_tick_domain?: boolean
          determinism_status: string
          empty_string_semantics: string
          event_evidence?: Json
          evidence_class: string
          evidence_digest: string
          false_semantics: string
          identity_requirement: string
          last_verified_at?: string | null
          mapping_status: string
          missing_semantics: string
          normalization: string
          normalization_executed?: boolean
          null_semantics: string
          parity_status: string
          parser_api: string
          python_evidence?: Json
          review_status: string
          semantic_mismatch?: boolean
          source_capability: string
          source_field: string
          updated_at?: string
          wasm_evidence?: Json
          zero_semantics: string
        }
        Update: {
          canonical_authorization?: boolean
          canonical_field?: string
          created_at?: string
          depends_on_full_tick_domain?: boolean
          determinism_status?: string
          empty_string_semantics?: string
          event_evidence?: Json
          evidence_class?: string
          evidence_digest?: string
          false_semantics?: string
          identity_requirement?: string
          last_verified_at?: string | null
          mapping_status?: string
          missing_semantics?: string
          normalization?: string
          normalization_executed?: boolean
          null_semantics?: string
          parity_status?: string
          parser_api?: string
          python_evidence?: Json
          review_status?: string
          semantic_mismatch?: boolean
          source_capability?: string
          source_field?: string
          updated_at?: string
          wasm_evidence?: Json
          zero_semantics?: string
        }
        Relationships: []
      }
      canonical_mapping_inventory_release_rows: {
        Row: {
          canonical_authorization: boolean
          canonical_field: string
          created_at: string
          determinism_status: string
          evidence_digest: string
          identity_dependency: string
          mapping_class: string
          metadata: Json
          parity_status: string
          persistence_validation: string
          release_id: string
          semantic_validation: string
          source_capability: string
          source_field: string
          tick_dependency: string
        }
        Insert: {
          canonical_authorization?: boolean
          canonical_field: string
          created_at?: string
          determinism_status: string
          evidence_digest: string
          identity_dependency: string
          mapping_class: string
          metadata: Json
          parity_status: string
          persistence_validation: string
          release_id: string
          semantic_validation: string
          source_capability: string
          source_field: string
          tick_dependency: string
        }
        Update: {
          canonical_authorization?: boolean
          canonical_field?: string
          created_at?: string
          determinism_status?: string
          evidence_digest?: string
          identity_dependency?: string
          mapping_class?: string
          metadata?: Json
          parity_status?: string
          persistence_validation?: string
          release_id?: string
          semantic_validation?: string
          source_capability?: string
          source_field?: string
          tick_dependency?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_mapping_inventory_release_rows_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "canonical_mapping_inventory_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      canonical_mapping_inventory_releases: {
        Row: {
          authoritative_candidate: boolean
          authorized_count: number
          created_at: string
          generator_commit: string
          generator_revision: string
          generic_count: number
          inventory_digest: string
          inventory_version: string
          matrix_digest: string
          provenance_metadata: Json
          release_id: string
          row_count: number
          schema_version: number
          status: string
          verified_count: number
        }
        Insert: {
          authoritative_candidate?: boolean
          authorized_count?: number
          created_at?: string
          generator_commit: string
          generator_revision: string
          generic_count?: number
          inventory_digest: string
          inventory_version: string
          matrix_digest: string
          provenance_metadata?: Json
          release_id: string
          row_count: number
          schema_version: number
          status: string
          verified_count?: number
        }
        Update: {
          authoritative_candidate?: boolean
          authorized_count?: number
          created_at?: string
          generator_commit?: string
          generator_revision?: string
          generic_count?: number
          inventory_digest?: string
          inventory_version?: string
          matrix_digest?: string
          provenance_metadata?: Json
          release_id?: string
          row_count?: number
          schema_version?: number
          status?: string
          verified_count?: number
        }
        Relationships: []
      }
      canonical_match_quarantine: {
        Row: {
          decision_ref: string
          evidence: Json
          match_id: string
          quarantined_at: string
          quarantined_by: string
          reason: string
        }
        Insert: {
          decision_ref: string
          evidence: Json
          match_id: string
          quarantined_at?: string
          quarantined_by: string
          reason: string
        }
        Update: {
          decision_ref?: string
          evidence?: Json
          match_id?: string
          quarantined_at?: string
          quarantined_by?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_match_quarantine_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_content_groups: {
        Row: {
          active: boolean
          created_at: string
          id: string
          key: string
          summary: string | null
          topics: string[]
          track: string
          track_source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key: string
          summary?: string | null
          topics?: string[]
          track: string
          track_source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key?: string
          summary?: string | null
          topics?: string[]
          track?: string
          track_source?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_courses: {
        Row: {
          active: boolean
          created_at: string
          family_slug: string
          group_id: string
          id: string
          key: string
          locale: string
          slug: string
          summary: string | null
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          family_slug: string
          group_id: string
          id?: string
          key: string
          locale: string
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          family_slug?: string
          group_id?: string
          id?: string
          key?: string
          locale?: string
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_courses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "catalog_content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_runs: {
        Row: {
          actor: string | null
          created_at: string
          dry_run: boolean
          id: string
          report: Json
          source: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          dry_run: boolean
          id?: string
          report: Json
          source: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          dry_run?: boolean
          id?: string
          report?: Json
          source?: string
        }
        Relationships: []
      }
      catalog_lessons: {
        Row: {
          active: boolean
          course_id: string | null
          course_slug: string
          created_at: string
          family_slug: string
          group_id: string
          id: string
          key: string
          language_evidence: string
          language_status: string
          locale: string | null
          position: number | null
          summary: string | null
          title: string
          topics: string[]
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          course_id?: string | null
          course_slug: string
          created_at?: string
          family_slug: string
          group_id: string
          id?: string
          key: string
          language_evidence: string
          language_status: string
          locale?: string | null
          position?: number | null
          summary?: string | null
          title: string
          topics?: string[]
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          course_id?: string | null
          course_slug?: string
          created_at?: string
          family_slug?: string
          group_id?: string
          id?: string
          key?: string
          language_evidence?: string
          language_status?: string
          locale?: string | null
          position?: number | null
          summary?: string | null
          title?: string
          topics?: string[]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "catalog_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_lessons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "catalog_content_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_conversations: {
        Row: {
          created_at: string
          id: string
          player_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_conversations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          content: string
          context_id: string | null
          context_type: string | null
          conversation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["coach_role"]
        }
        Insert: {
          content: string
          context_id?: string | null
          context_type?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["coach_role"]
        }
        Update: {
          content?: string
          context_id?: string | null
          context_type?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["coach_role"]
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_preferences: {
        Row: {
          created_at: string
          main_difficulty: string | null
          maps: string[]
          player_id: string
          preferred_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          main_difficulty?: string | null
          maps?: string[]
          player_id: string
          preferred_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          main_difficulty?: string | null
          maps?: string[]
          player_id?: string
          preferred_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_request_reservations: {
        Row: {
          attempt_count: number
          coach_message_id: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          message_sha256: string
          model: string | null
          pending_context_type: string | null
          pending_reply: string | null
          player_id: string
          player_message_id: string | null
          provider: string | null
          request_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          coach_message_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          message_sha256: string
          model?: string | null
          pending_context_type?: string | null
          pending_reply?: string | null
          player_id: string
          player_message_id?: string | null
          provider?: string | null
          request_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          coach_message_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          message_sha256?: string
          model?: string | null
          pending_context_type?: string | null
          pending_reply?: string | null
          player_id?: string
          player_message_id?: string | null
          provider?: string | null
          request_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_request_reservations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_request_reservations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      death_feedback: {
        Row: {
          created_at: string
          death_tick: number
          id: string
          match_id: string
          note: string | null
          round_event_id: string
          round_number: number
          rule_id: string | null
          rules_version: string
          updated_at: string
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          death_tick: number
          id?: string
          match_id: string
          note?: string | null
          round_event_id: string
          round_number: number
          rule_id?: string | null
          rules_version: string
          updated_at?: string
          user_id?: string
          verdict: string
        }
        Update: {
          created_at?: string
          death_tick?: number
          id?: string
          match_id?: string
          note?: string | null
          round_event_id?: string
          round_number?: number
          rule_id?: string | null
          rules_version?: string
          updated_at?: string
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "death_feedback_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_identity_decisions: {
        Row: {
          confidence_label: string | null
          confidence_score: number | null
          confirmation_status: string
          created_at: string
          event_key: string
          evidence: Json
          id: string
          job_id: string
          match_id: string | null
          method: string | null
          nickname: string | null
          participant_key: string | null
          player_id: string
          reason: string | null
          source: string
          status: string
          team: string | null
          upload_id: string
          user_id: string
        }
        Insert: {
          confidence_label?: string | null
          confidence_score?: number | null
          confirmation_status?: string
          created_at?: string
          event_key: string
          evidence?: Json
          id?: string
          job_id: string
          match_id?: string | null
          method?: string | null
          nickname?: string | null
          participant_key?: string | null
          player_id: string
          reason?: string | null
          source: string
          status: string
          team?: string | null
          upload_id: string
          user_id: string
        }
        Update: {
          confidence_label?: string | null
          confidence_score?: number | null
          confirmation_status?: string
          created_at?: string
          event_key?: string
          evidence?: Json
          id?: string
          job_id?: string
          match_id?: string | null
          method?: string | null
          nickname?: string | null
          participant_key?: string | null
          player_id?: string
          reason?: string | null
          source?: string
          status?: string
          team?: string | null
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_identity_decisions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_identity_decisions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_identity_decisions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_identity_decisions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_identity_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_job_dispatch_closures: {
        Row: {
          closed_at: string
          delivery_count: number
          dispatch_attempt: number
          id: number
          job_id: string
          lifecycle: string | null
          queue_message_id: number | null
          reason: string
          retried: boolean
          upload_id: string
        }
        Insert: {
          closed_at?: string
          delivery_count: number
          dispatch_attempt: number
          id?: never
          job_id: string
          lifecycle?: string | null
          queue_message_id?: number | null
          reason: string
          retried: boolean
          upload_id: string
        }
        Update: {
          closed_at?: string
          delivery_count?: number
          dispatch_attempt?: number
          id?: never
          job_id?: string
          lifecycle?: string | null
          queue_message_id?: number | null
          reason?: string
          retried?: boolean
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_job_dispatch_closures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_job_dispatch_failures: {
        Row: {
          dispatch_attempt: number
          error_code: string
          error_message: string | null
          failed_at: string
          id: number
          job_id: string
          permanent: boolean
          queue_message_id: number | null
          retried: boolean
          upload_id: string
        }
        Insert: {
          dispatch_attempt: number
          error_code: string
          error_message?: string | null
          failed_at?: string
          id?: never
          job_id: string
          permanent: boolean
          queue_message_id?: number | null
          retried: boolean
          upload_id: string
        }
        Update: {
          dispatch_attempt?: number
          error_code?: string
          error_message?: string | null
          failed_at?: string
          id?: never
          job_id?: string
          permanent?: boolean
          queue_message_id?: number | null
          retried?: boolean
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_job_dispatch_failures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_jobs: {
        Row: {
          admission_contract: string | null
          admission_decision_id: string | null
          admission_excluded_metrics: string[] | null
          admission_limitations: string[] | null
          admission_verdict: string | null
          analysis_version: string
          attachment_confidence: number | null
          attachment_confidence_label: string | null
          attachment_confirmation_status: string
          attachment_declared_at: string | null
          attachment_declared_by: string | null
          attachment_method: string | null
          attachment_participant_key: string | null
          attachment_reason: string | null
          attachment_source: string | null
          attachment_state: string
          attempt_number: number
          cancel_requested_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cleanup_attempt_count: number
          cleanup_claim_expires_at: string | null
          cleanup_claim_token: string | null
          cleanup_claimed_at: string | null
          cleanup_error: string | null
          created_at: string
          declared_nickname: string | null
          declared_participant_key: string | null
          deletion_reason: string | null
          delivery_count: number
          demo_sha256: string | null
          dispatch_attempt: number | null
          dispatched_at: string | null
          durable_dispatch_enabled: boolean
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          events_detected: number | null
          extraction_confidence: number | null
          file_size: number | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          identity_status: string
          last_cleanup_attempt_at: string | null
          lease_expires_at: string | null
          match_id: string | null
          match_integrity: Json | null
          max_retries: number
          observed_nickname: string | null
          parser_name: string | null
          parser_revision: string | null
          parser_version: string | null
          partial_parse: boolean
          player_id: string | null
          players_detected: number | null
          quality_flags: Json
          queue_message_id: number | null
          queued_at: string
          replacement_reason: string | null
          resolved_steam_id: string | null
          retain_until: string | null
          retention_policy_version: string | null
          retry_count: number
          rounds_detected: number | null
          rounds_valid: number | null
          schema_version: number
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["upload_status"]
          storage_delete_attempted_at: string | null
          storage_delete_verified_at: string | null
          storage_deleted_at: string | null
          storage_path: string | null
          superseded_by_job_id: string | null
          supersedes_job_id: string | null
          updated_at: string
          upload_id: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          admission_contract?: string | null
          admission_decision_id?: string | null
          admission_excluded_metrics?: string[] | null
          admission_limitations?: string[] | null
          admission_verdict?: string | null
          analysis_version?: string
          attachment_confidence?: number | null
          attachment_confidence_label?: string | null
          attachment_confirmation_status?: string
          attachment_declared_at?: string | null
          attachment_declared_by?: string | null
          attachment_method?: string | null
          attachment_participant_key?: string | null
          attachment_reason?: string | null
          attachment_source?: string | null
          attachment_state?: string
          attempt_number?: number
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cleanup_attempt_count?: number
          cleanup_claim_expires_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          cleanup_error?: string | null
          created_at?: string
          declared_nickname?: string | null
          declared_participant_key?: string | null
          deletion_reason?: string | null
          delivery_count?: number
          demo_sha256?: string | null
          dispatch_attempt?: number | null
          dispatched_at?: string | null
          durable_dispatch_enabled?: boolean
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          events_detected?: number | null
          extraction_confidence?: number | null
          file_size?: number | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          identity_status?: string
          last_cleanup_attempt_at?: string | null
          lease_expires_at?: string | null
          match_id?: string | null
          match_integrity?: Json | null
          max_retries?: number
          observed_nickname?: string | null
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          partial_parse?: boolean
          player_id?: string | null
          players_detected?: number | null
          quality_flags?: Json
          queue_message_id?: number | null
          queued_at?: string
          replacement_reason?: string | null
          resolved_steam_id?: string | null
          retain_until?: string | null
          retention_policy_version?: string | null
          retry_count?: number
          rounds_detected?: number | null
          rounds_valid?: number | null
          schema_version?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_delete_attempted_at?: string | null
          storage_delete_verified_at?: string | null
          storage_deleted_at?: string | null
          storage_path?: string | null
          superseded_by_job_id?: string | null
          supersedes_job_id?: string | null
          updated_at?: string
          upload_id: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          admission_contract?: string | null
          admission_decision_id?: string | null
          admission_excluded_metrics?: string[] | null
          admission_limitations?: string[] | null
          admission_verdict?: string | null
          analysis_version?: string
          attachment_confidence?: number | null
          attachment_confidence_label?: string | null
          attachment_confirmation_status?: string
          attachment_declared_at?: string | null
          attachment_declared_by?: string | null
          attachment_method?: string | null
          attachment_participant_key?: string | null
          attachment_reason?: string | null
          attachment_source?: string | null
          attachment_state?: string
          attempt_number?: number
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cleanup_attempt_count?: number
          cleanup_claim_expires_at?: string | null
          cleanup_claim_token?: string | null
          cleanup_claimed_at?: string | null
          cleanup_error?: string | null
          created_at?: string
          declared_nickname?: string | null
          declared_participant_key?: string | null
          deletion_reason?: string | null
          delivery_count?: number
          demo_sha256?: string | null
          dispatch_attempt?: number | null
          dispatched_at?: string | null
          durable_dispatch_enabled?: boolean
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          events_detected?: number | null
          extraction_confidence?: number | null
          file_size?: number | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          identity_status?: string
          last_cleanup_attempt_at?: string | null
          lease_expires_at?: string | null
          match_id?: string | null
          match_integrity?: Json | null
          max_retries?: number
          observed_nickname?: string | null
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          partial_parse?: boolean
          player_id?: string | null
          players_detected?: number | null
          quality_flags?: Json
          queue_message_id?: number | null
          queued_at?: string
          replacement_reason?: string | null
          resolved_steam_id?: string | null
          retain_until?: string | null
          retention_policy_version?: string | null
          retry_count?: number
          rounds_detected?: number | null
          rounds_valid?: number | null
          schema_version?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_delete_attempted_at?: string | null
          storage_delete_verified_at?: string | null
          storage_deleted_at?: string | null
          storage_path?: string | null
          superseded_by_job_id?: string | null
          supersedes_job_id?: string | null
          updated_at?: string
          upload_id?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_jobs_admission_decision_id_fkey"
            columns: ["admission_decision_id"]
            isOneToOne: false
            referencedRelation: "raw_admission_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_superseded_by_job_id_fkey"
            columns: ["superseded_by_job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_supersedes_job_id_fkey"
            columns: ["supersedes_job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: true
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_problem_reports: {
        Row: {
          app_version: string | null
          attempt_number: number
          category: string
          created_at: string
          details: string | null
          email_attempts: number
          email_reason: string | null
          email_status: string
          error_code: string | null
          id: string
          job_id: string
          job_status: string
          locale: string
          occurrence_key: string
          page: string | null
          parser_revision: string | null
          protocol: string
          retry_count: number
          stage: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          attempt_number: number
          category: string
          created_at?: string
          details?: string | null
          email_attempts?: number
          email_reason?: string | null
          email_status?: string
          error_code?: string | null
          id?: string
          job_id: string
          job_status: string
          locale?: string
          occurrence_key: string
          page?: string | null
          parser_revision?: string | null
          protocol: string
          retry_count?: number
          stage?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          attempt_number?: number
          category?: string
          created_at?: string
          details?: string | null
          email_attempts?: number
          email_reason?: string | null
          email_status?: string
          error_code?: string | null
          id?: string
          job_id?: string
          job_status?: string
          locale?: string
          occurrence_key?: string
          page?: string | null
          parser_revision?: string | null
          protocol?: string
          retry_count?: number
          stage?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_problem_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_logs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          locale: string
          provider: string
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          locale?: string
          provider: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locale?: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      faceit_oauth_failures: {
        Row: {
          created_at: string
          error_code: string
          http_status: number | null
          id: number
          purpose: string
          stage: string
        }
        Insert: {
          created_at?: string
          error_code: string
          http_status?: number | null
          id?: never
          purpose: string
          stage: string
        }
        Update: {
          created_at?: string
          error_code?: string
          http_status?: number | null
          id?: never
          purpose?: string
          stage?: string
        }
        Relationships: []
      }
      faceit_sync_jobs: {
        Row: {
          attempts: number
          connection_id: string
          created_at: string
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          last_error: string | null
          matches_found: number | null
          matches_new: number | null
          matches_skipped: number | null
          matches_updated: number | null
          metadata: Json
          next_attempt_at: string | null
          player_id: string
          stale_recoveries: number
          started_at: string | null
          status: Database["public"]["Enums"]["faceit_sync_job_status"]
          type: Database["public"]["Enums"]["faceit_sync_job_type"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          connection_id: string
          created_at?: string
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          matches_found?: number | null
          matches_new?: number | null
          matches_skipped?: number | null
          matches_updated?: number | null
          metadata?: Json
          next_attempt_at?: string | null
          player_id: string
          stale_recoveries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["faceit_sync_job_status"]
          type?: Database["public"]["Enums"]["faceit_sync_job_type"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          connection_id?: string
          created_at?: string
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          matches_found?: number | null
          matches_new?: number | null
          matches_skipped?: number | null
          matches_updated?: number | null
          metadata?: Json
          next_attempt_at?: string | null
          player_id?: string
          stale_recoveries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["faceit_sync_job_status"]
          type?: Database["public"]["Enums"]["faceit_sync_job_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faceit_sync_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "player_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faceit_sync_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamers_club_profile_snapshots: {
        Row: {
          completeness: number | null
          connection_id: string | null
          created_at: string
          external_id: string | null
          id: string
          observed_at: string
          player_id: string
          profile: Json
          profile_slug: string | null
          source_version: string
        }
        Insert: {
          completeness?: number | null
          connection_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          observed_at?: string
          player_id: string
          profile?: Json
          profile_slug?: string | null
          source_version: string
        }
        Update: {
          completeness?: number | null
          connection_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          observed_at?: string
          player_id?: string
          profile?: Json
          profile_slug?: string | null
          source_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamers_club_profile_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "player_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamers_club_profile_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamers_club_sync_jobs: {
        Row: {
          api_calls_used: number
          attempts: number
          connection_id: string | null
          created_at: string
          external_access_status: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          items_collected: number
          items_deferred: number
          items_expected: number | null
          items_skipped: number
          last_error: string | null
          last_error_code: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string | null
          outcome: Database["public"]["Enums"]["gc_job_outcome"] | null
          player_id: string
          stale_recoveries: number
          started_at: string | null
          status: Database["public"]["Enums"]["gc_job_status"]
          type: Database["public"]["Enums"]["gc_job_type"]
          updated_at: string
        }
        Insert: {
          api_calls_used?: number
          attempts?: number
          connection_id?: string | null
          created_at?: string
          external_access_status?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          items_collected?: number
          items_deferred?: number
          items_expected?: number | null
          items_skipped?: number
          last_error?: string | null
          last_error_code?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string | null
          outcome?: Database["public"]["Enums"]["gc_job_outcome"] | null
          player_id: string
          stale_recoveries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["gc_job_status"]
          type: Database["public"]["Enums"]["gc_job_type"]
          updated_at?: string
        }
        Update: {
          api_calls_used?: number
          attempts?: number
          connection_id?: string | null
          created_at?: string
          external_access_status?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          items_collected?: number
          items_deferred?: number
          items_expected?: number | null
          items_skipped?: number
          last_error?: string | null
          last_error_code?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string | null
          outcome?: Database["public"]["Enums"]["gc_job_outcome"] | null
          player_id?: string
          stale_recoveries?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["gc_job_status"]
          type?: Database["public"]["Enums"]["gc_job_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamers_club_sync_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "player_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamers_club_sync_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      h3e_attempt_authorizations: {
        Row: {
          attempt_number: number
          authorized_by: string
          decision_ref: string
          demo_sha256: string
          evidence: Json
          job_id: string
          recorded_at: string
          upload_id: string
        }
        Insert: {
          attempt_number: number
          authorized_by: string
          decision_ref: string
          demo_sha256: string
          evidence: Json
          job_id: string
          recorded_at?: string
          upload_id: string
        }
        Update: {
          attempt_number?: number
          authorized_by?: string
          decision_ref?: string
          demo_sha256?: string
          evidence?: Json
          job_id?: string
          recorded_at?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "h3e_attempt_authorizations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      h3e91_execution_evidence_ledger: {
        Row: {
          attempt_number: number | null
          correlation_id: string | null
          created_at: string
          demo_sha256: string | null
          event_at: string | null
          event_digest: string | null
          event_id: string | null
          event_type: string
          event_version: number | null
          execution_id: string | null
          execution_surface: string
          file_size: number | null
          id: string
          job_id: string | null
          metadata_digest: string | null
          outcome_code: string | null
          parser_name: string | null
          parser_revision: string | null
          parser_version: string | null
          source: string
          upload_id: string | null
          worker_build_commit: string | null
        }
        Insert: {
          attempt_number?: number | null
          correlation_id?: string | null
          created_at?: string
          demo_sha256?: string | null
          event_at?: string | null
          event_digest?: string | null
          event_id?: string | null
          event_type: string
          event_version?: number | null
          execution_id?: string | null
          execution_surface: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          metadata_digest?: string | null
          outcome_code?: string | null
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          source: string
          upload_id?: string | null
          worker_build_commit?: string | null
        }
        Update: {
          attempt_number?: number | null
          correlation_id?: string | null
          created_at?: string
          demo_sha256?: string | null
          event_at?: string | null
          event_digest?: string | null
          event_id?: string | null
          event_type?: string
          event_version?: number | null
          execution_id?: string | null
          execution_surface?: string
          file_size?: number | null
          id?: string
          job_id?: string | null
          metadata_digest?: string | null
          outcome_code?: string | null
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          source?: string
          upload_id?: string | null
          worker_build_commit?: string | null
        }
        Relationships: []
      }
      identity_correlation_evidence: {
        Row: {
          attribute: string
          confidence_score: number
          created_at: string
          evidence_value_hash: string | null
          expires_at: string | null
          id: string
          identity_a_id: string | null
          identity_a_source: string
          identity_b_id: string | null
          identity_b_source: string
          match_type: string
          observed_at: string
          provenance: string
          user_id: string
        }
        Insert: {
          attribute: string
          confidence_score?: number
          created_at?: string
          evidence_value_hash?: string | null
          expires_at?: string | null
          id?: string
          identity_a_id?: string | null
          identity_a_source: string
          identity_b_id?: string | null
          identity_b_source: string
          match_type: string
          observed_at?: string
          provenance?: string
          user_id: string
        }
        Update: {
          attribute?: string
          confidence_score?: number
          created_at?: string
          evidence_value_hash?: string | null
          expires_at?: string | null
          id?: string
          identity_a_id?: string | null
          identity_a_source?: string
          identity_b_id?: string | null
          identity_b_source?: string
          match_type?: string
          observed_at?: string
          provenance?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_correlation_evidence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_skills: {
        Row: {
          lesson_id: string
          skill_id: string
        }
        Insert: {
          lesson_id: string
          skill_id: string
        }
        Update: {
          lesson_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_skills_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_translations: {
        Row: {
          description: string | null
          lesson_id: string
          locale: string
          title: string
        }
        Insert: {
          description?: string | null
          lesson_id: string
          locale: string
          title: string
        }
        Update: {
          description?: string | null
          lesson_id?: string
          locale?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_translations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          active: boolean
          duration: string | null
          id: string
          lesson_url: string | null
          module: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          duration?: string | null
          id?: string
          lesson_url?: string | null
          module?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          duration?: string | null
          id?: string
          lesson_url?: string | null
          module?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      match_features: {
        Row: {
          analysis_version: string
          created_at: string
          extraction_confidence: number | null
          features: Json
          id: string
          match_id: string
          partial_parse: boolean
          player_id: string | null
          sample_clutches: number | null
          sample_opening_duels: number | null
          sample_rounds: number
          schema_version: number
          steam_id: string | null
        }
        Insert: {
          analysis_version?: string
          created_at?: string
          extraction_confidence?: number | null
          features?: Json
          id?: string
          match_id: string
          partial_parse?: boolean
          player_id?: string | null
          sample_clutches?: number | null
          sample_opening_duels?: number | null
          sample_rounds?: number
          schema_version?: number
          steam_id?: string | null
        }
        Update: {
          analysis_version?: string
          created_at?: string
          extraction_confidence?: number | null
          features?: Json
          id?: string
          match_id?: string
          partial_parse?: boolean
          player_id?: string | null
          sample_clutches?: number | null
          sample_opening_duels?: number | null
          sample_rounds?: number
          schema_version?: number
          steam_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_features_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_features_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_flash_assist_provenance: {
        Row: {
          computed_at: string
          credited: number | null
          credited_by_flag: number | null
          credited_by_timing: number | null
          match_id: string
          method: string
          method_version: string
          player_id: string
          unattributed_candidates: number | null
        }
        Insert: {
          computed_at?: string
          credited?: number | null
          credited_by_flag?: number | null
          credited_by_timing?: number | null
          match_id: string
          method: string
          method_version: string
          player_id: string
          unattributed_candidates?: number | null
        }
        Update: {
          computed_at?: string
          credited?: number | null
          credited_by_flag?: number | null
          credited_by_timing?: number | null
          match_id?: string
          method?: string
          method_version?: string
          player_id?: string
          unattributed_candidates?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_flash_assist_provenance_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_flash_assist_provenance_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_metrics: {
        Row: {
          adr: number | null
          assists: number | null
          clutch_attempts: number | null
          clutch_wins: number | null
          clutches: number | null
          created_at: string
          ct_rating: number | null
          damage_efficiency: number | null
          damage_enemy_hp: number | null
          damage_enemy_hp_excluded_hits: number | null
          damage_enemy_hp_method: string | null
          damage_taken: number | null
          deaths: number | null
          first_deaths: number | null
          first_kills: number | null
          flash_assists: number | null
          grenade_damage: number | null
          hs_percent: number | null
          id: string
          kast: number | null
          kills: number | null
          match_id: string
          multi_kills: number | null
          opening_attempts: number | null
          opening_success: number | null
          opening_success_rate: number | null
          player_id: string
          rating: number | null
          rounds_played: number | null
          t_rating: number | null
          trade_deaths: number | null
          trade_kills: number | null
          utility_damage: number | null
        }
        Insert: {
          adr?: number | null
          assists?: number | null
          clutch_attempts?: number | null
          clutch_wins?: number | null
          clutches?: number | null
          created_at?: string
          ct_rating?: number | null
          damage_efficiency?: number | null
          damage_enemy_hp?: number | null
          damage_enemy_hp_excluded_hits?: number | null
          damage_enemy_hp_method?: string | null
          damage_taken?: number | null
          deaths?: number | null
          first_deaths?: number | null
          first_kills?: number | null
          flash_assists?: number | null
          grenade_damage?: number | null
          hs_percent?: number | null
          id?: string
          kast?: number | null
          kills?: number | null
          match_id: string
          multi_kills?: number | null
          opening_attempts?: number | null
          opening_success?: number | null
          opening_success_rate?: number | null
          player_id: string
          rating?: number | null
          rounds_played?: number | null
          t_rating?: number | null
          trade_deaths?: number | null
          trade_kills?: number | null
          utility_damage?: number | null
        }
        Update: {
          adr?: number | null
          assists?: number | null
          clutch_attempts?: number | null
          clutch_wins?: number | null
          clutches?: number | null
          created_at?: string
          ct_rating?: number | null
          damage_efficiency?: number | null
          damage_enemy_hp?: number | null
          damage_enemy_hp_excluded_hits?: number | null
          damage_enemy_hp_method?: string | null
          damage_taken?: number | null
          deaths?: number | null
          first_deaths?: number | null
          first_kills?: number | null
          flash_assists?: number | null
          grenade_damage?: number | null
          hs_percent?: number | null
          id?: string
          kast?: number | null
          kills?: number | null
          match_id?: string
          multi_kills?: number | null
          opening_attempts?: number | null
          opening_success?: number | null
          opening_success_rate?: number | null
          player_id?: string
          rating?: number | null
          rounds_played?: number | null
          t_rating?: number | null
          trade_deaths?: number | null
          trade_kills?: number | null
          utility_damage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_metrics_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_participants: {
        Row: {
          created_at: string
          external_player_id: string | null
          id: string
          identity_confidence: number | null
          identity_status: Database["public"]["Enums"]["identity_link_status"]
          internal_player_id: string | null
          is_target_player: boolean
          match_id: string
          metadata: Json
          nickname_snapshot: string | null
          participant_key: string
          source: Database["public"]["Enums"]["data_source"]
          steam_id64: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_player_id?: string | null
          id?: string
          identity_confidence?: number | null
          identity_status?: Database["public"]["Enums"]["identity_link_status"]
          internal_player_id?: string | null
          is_target_player?: boolean
          match_id: string
          metadata?: Json
          nickname_snapshot?: string | null
          participant_key: string
          source: Database["public"]["Enums"]["data_source"]
          steam_id64?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_player_id?: string | null
          id?: string
          identity_confidence?: number | null
          identity_status?: Database["public"]["Enums"]["identity_link_status"]
          internal_player_id?: string | null
          is_target_player?: boolean
          match_id?: string
          metadata?: Json
          nickname_snapshot?: string | null
          participant_key?: string
          source?: Database["public"]["Enums"]["data_source"]
          steam_id64?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_internal_player_id_fkey"
            columns: ["internal_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_rounds: {
        Row: {
          bomb_defused: boolean | null
          bomb_exploded: boolean | null
          bomb_planted: boolean | null
          buy_context: string | null
          created_at: string
          duration_seconds: number | null
          end_tick: number | null
          end_time_seconds: number | null
          id: string
          match_id: string
          metadata: Json
          player_equipment_value: number | null
          player_money_end: number | null
          player_money_start: number | null
          player_side: string | null
          player_survived: boolean | null
          quality: Json
          round_number: number
          start_tick: number | null
          start_time_seconds: number | null
          win_reason: string | null
          winner_side: string | null
          winner_team: string | null
          winning_side: string | null
          winning_team: string | null
        }
        Insert: {
          bomb_defused?: boolean | null
          bomb_exploded?: boolean | null
          bomb_planted?: boolean | null
          buy_context?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_tick?: number | null
          end_time_seconds?: number | null
          id?: string
          match_id: string
          metadata?: Json
          player_equipment_value?: number | null
          player_money_end?: number | null
          player_money_start?: number | null
          player_side?: string | null
          player_survived?: boolean | null
          quality?: Json
          round_number: number
          start_tick?: number | null
          start_time_seconds?: number | null
          win_reason?: string | null
          winner_side?: string | null
          winner_team?: string | null
          winning_side?: string | null
          winning_team?: string | null
        }
        Update: {
          bomb_defused?: boolean | null
          bomb_exploded?: boolean | null
          bomb_planted?: boolean | null
          buy_context?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_tick?: number | null
          end_time_seconds?: number | null
          id?: string
          match_id?: string
          metadata?: Json
          player_equipment_value?: number | null
          player_money_end?: number | null
          player_money_start?: number | null
          player_side?: string | null
          player_survived?: boolean | null
          quality?: Json
          round_number?: number
          start_tick?: number | null
          start_time_seconds?: number | null
          win_reason?: string | null
          winner_side?: string | null
          winner_team?: string | null
          winning_side?: string | null
          winning_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_rounds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_series: {
        Row: {
          best_of: number | null
          canonical_schema_version: number
          created_at: string
          discovered_by_player_id: string | null
          duration_seconds: number | null
          external_series_id: string | null
          finished_at: string | null
          game: string
          id: string
          maps_won_team_a: number | null
          maps_won_team_b: number | null
          metadata: Json
          quality: Json
          source: Database["public"]["Enums"]["data_source"]
          started_at: string | null
          status: string
          team_a: string | null
          team_b: string | null
          updated_at: string
          winner_team: string | null
        }
        Insert: {
          best_of?: number | null
          canonical_schema_version?: number
          created_at?: string
          discovered_by_player_id?: string | null
          duration_seconds?: number | null
          external_series_id?: string | null
          finished_at?: string | null
          game?: string
          id?: string
          maps_won_team_a?: number | null
          maps_won_team_b?: number | null
          metadata?: Json
          quality?: Json
          source: Database["public"]["Enums"]["data_source"]
          started_at?: string | null
          status?: string
          team_a?: string | null
          team_b?: string | null
          updated_at?: string
          winner_team?: string | null
        }
        Update: {
          best_of?: number | null
          canonical_schema_version?: number
          created_at?: string
          discovered_by_player_id?: string | null
          duration_seconds?: number | null
          external_series_id?: string | null
          finished_at?: string | null
          game?: string
          id?: string
          maps_won_team_a?: number | null
          maps_won_team_b?: number | null
          metadata?: Json
          quality?: Json
          source?: Database["public"]["Enums"]["data_source"]
          started_at?: string | null
          status?: string
          team_a?: string | null
          team_b?: string | null
          updated_at?: string
          winner_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_series_discovered_by_player_id_fkey"
            columns: ["discovered_by_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sources: {
        Row: {
          created_at: string
          external_match_id: string | null
          external_parent_id: string | null
          fetched_at: string
          fingerprint: string | null
          id: string
          match_id: string | null
          metadata: Json
          observation_count: number
          quality: Json
          rounds_digest: string | null
          series_id: string | null
          source: Database["public"]["Enums"]["data_source"]
          source_contract_version: string
          source_updated_at: string | null
          source_version: string | null
          status: string
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          created_at?: string
          external_match_id?: string | null
          external_parent_id?: string | null
          fetched_at: string
          fingerprint?: string | null
          id?: string
          match_id?: string | null
          metadata?: Json
          observation_count?: number
          quality?: Json
          rounds_digest?: string | null
          series_id?: string | null
          source: Database["public"]["Enums"]["data_source"]
          source_contract_version: string
          source_updated_at?: string | null
          source_version?: string | null
          status?: string
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          created_at?: string
          external_match_id?: string | null
          external_parent_id?: string | null
          fetched_at?: string
          fingerprint?: string | null
          id?: string
          match_id?: string | null
          metadata?: Json
          observation_count?: number
          quality?: Json
          rounds_digest?: string | null
          series_id?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          source_contract_version?: string
          source_updated_at?: string | null
          source_version?: string | null
          status?: string
          updated_at?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_sources_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sources_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "match_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sources_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      match_trajectories: {
        Row: {
          created_at: string
          encoding: string | null
          match_id: string
          parser_revision: string | null
          reason: string | null
          schema: string
          skipped: Json
          status: string
          step_ticks: number | null
        }
        Insert: {
          created_at?: string
          encoding?: string | null
          match_id: string
          parser_revision?: string | null
          reason?: string | null
          schema: string
          skipped?: Json
          status: string
          step_ticks?: number | null
        }
        Update: {
          created_at?: string
          encoding?: string | null
          match_id?: string
          parser_revision?: string | null
          reason?: string | null
          schema?: string
          skipped?: Json
          status?: string
          step_ticks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_trajectories_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          canonical_schema_version: number
          canonical_source: Database["public"]["Enums"]["data_source"] | null
          canonical_status: string | null
          content_fingerprint: string | null
          coverage: Json
          created_at: string
          data_source: Database["public"]["Enums"]["data_source"]
          demo_metadata: Json | null
          duration_seconds: number | null
          external_match_id: string | null
          finished: boolean
          finished_at: string | null
          game: string
          game_version: string | null
          id: string
          map: string | null
          map_number: number | null
          match_date: string | null
          platform: string | null
          played_at: string | null
          player_id: string | null
          quality: Json
          result: Database["public"]["Enums"]["match_result"] | null
          round_count: number | null
          round_source: Database["public"]["Enums"]["data_source"] | null
          rounds: number | null
          score_opponent: number | null
          score_player: number | null
          score_team_a: number | null
          score_team_b: number | null
          series_id: string | null
          source_complete: boolean
          source_fetch_attempts: number
          source_fetched_at: string | null
          source_metadata: Json | null
          source_version: string | null
          started_at: string | null
          team_a: string | null
          team_b: string | null
          team_opponent: string | null
          team_player: string | null
          terminal: boolean
          upload_id: string | null
          winner_team: string | null
        }
        Insert: {
          canonical_schema_version?: number
          canonical_source?: Database["public"]["Enums"]["data_source"] | null
          canonical_status?: string | null
          content_fingerprint?: string | null
          coverage?: Json
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source"]
          demo_metadata?: Json | null
          duration_seconds?: number | null
          external_match_id?: string | null
          finished?: boolean
          finished_at?: string | null
          game?: string
          game_version?: string | null
          id?: string
          map?: string | null
          map_number?: number | null
          match_date?: string | null
          platform?: string | null
          played_at?: string | null
          player_id?: string | null
          quality?: Json
          result?: Database["public"]["Enums"]["match_result"] | null
          round_count?: number | null
          round_source?: Database["public"]["Enums"]["data_source"] | null
          rounds?: number | null
          score_opponent?: number | null
          score_player?: number | null
          score_team_a?: number | null
          score_team_b?: number | null
          series_id?: string | null
          source_complete?: boolean
          source_fetch_attempts?: number
          source_fetched_at?: string | null
          source_metadata?: Json | null
          source_version?: string | null
          started_at?: string | null
          team_a?: string | null
          team_b?: string | null
          team_opponent?: string | null
          team_player?: string | null
          terminal?: boolean
          upload_id?: string | null
          winner_team?: string | null
        }
        Update: {
          canonical_schema_version?: number
          canonical_source?: Database["public"]["Enums"]["data_source"] | null
          canonical_status?: string | null
          content_fingerprint?: string | null
          coverage?: Json
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source"]
          demo_metadata?: Json | null
          duration_seconds?: number | null
          external_match_id?: string | null
          finished?: boolean
          finished_at?: string | null
          game?: string
          game_version?: string | null
          id?: string
          map?: string | null
          map_number?: number | null
          match_date?: string | null
          platform?: string | null
          played_at?: string | null
          player_id?: string | null
          quality?: Json
          result?: Database["public"]["Enums"]["match_result"] | null
          round_count?: number | null
          round_source?: Database["public"]["Enums"]["data_source"] | null
          rounds?: number | null
          score_opponent?: number | null
          score_player?: number | null
          score_team_a?: number | null
          score_team_b?: number | null
          series_id?: string | null
          source_complete?: boolean
          source_fetch_attempts?: number
          source_fetched_at?: string | null
          source_metadata?: Json | null
          source_version?: string | null
          started_at?: string | null
          team_a?: string | null
          team_b?: string | null
          team_opponent?: string | null
          team_player?: string | null
          terminal?: boolean
          upload_id?: string | null
          winner_team?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "match_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_bookmarks: {
        Row: {
          created_at: string
          event_ref: string | null
          id: string
          kind: string
          map: string | null
          match_id: string | null
          note: string
          round_number: number | null
          schema_version: number
          source: string
          tags: string[]
          tick_end: number
          tick_start: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_ref?: string | null
          id?: string
          kind: string
          map?: string | null
          match_id?: string | null
          note?: string
          round_number?: number | null
          schema_version?: number
          source?: string
          tags?: string[]
          tick_end: number
          tick_start: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_ref?: string | null
          id?: string
          kind?: string
          map?: string | null
          match_id?: string | null
          note?: string
          round_number?: number | null
          schema_version?: number
          source?: string
          tags?: string[]
          tick_end?: number
          tick_start?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_bookmarks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_collection_items: {
        Row: {
          added_at: string
          bookmark_id: string
          collection_id: string
          position: number
          user_id: string
        }
        Insert: {
          added_at?: string
          bookmark_id: string
          collection_id: string
          position: number
          user_id?: string
        }
        Update: {
          added_at?: string
          bookmark_id?: string
          collection_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_collection_items_bookmark_id_fkey"
            columns: ["bookmark_id"]
            isOneToOne: false
            referencedRelation: "moment_bookmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "moment_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_collections: {
        Row: {
          archived: boolean
          created_at: string
          description: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_campaign_translations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          campaign_id: string
          locale: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          campaign_id: string
          locale: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          campaign_id?: string
          locale?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_campaign_translations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaign_translations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaign_translations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          accepted: number
          attempts: number
          confirmed_audience: number | null
          created_at: string
          created_by: string
          cursor_user: string | null
          duplicates: number
          failures: number
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          link: string
          name: string
          rejected: number
          scheduled_at: string | null
          segment: Json
          segment_id: string | null
          source_locale: string
          started_at: string | null
          status: string
          suppressed: number
          targeted: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          accepted?: number
          attempts?: number
          confirmed_audience?: number | null
          created_at?: string
          created_by: string
          cursor_user?: string | null
          duplicates?: number
          failures?: number
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          link?: string
          name: string
          rejected?: number
          scheduled_at?: string | null
          segment?: Json
          segment_id?: string | null
          source_locale?: string
          started_at?: string | null
          status?: string
          suppressed?: number
          targeted?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          accepted?: number
          attempts?: number
          confirmed_audience?: number | null
          created_at?: string
          created_by?: string
          cursor_user?: string | null
          duplicates?: number
          failures?: number
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          link?: string
          name?: string
          rejected?: number
          scheduled_at?: string | null
          segment?: Json
          segment_id?: string | null
          source_locale?: string
          started_at?: string | null
          status?: string
          suppressed?: number
          targeted?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "notification_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_campaigns_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          category: string
          created_at: string
          id: string
          idempotency_key: string
          occurred_at: string
          payload: Json
          reason: string | null
          source: string
          source_ref: string | null
          status: string
          type: string
          user_id: string
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          idempotency_key: string
          occurred_at: string
          payload?: Json
          reason?: string | null
          source: string
          source_ref?: string | null
          status: string
          type: string
          user_id: string
          version: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          payload?: Json
          reason?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          type?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_maintenance_runs: {
        Row: {
          batches: number
          duration_ms: number | null
          error_code: string | null
          events_deleted: number
          finished_at: string | null
          id: number
          job: string
          notifications_deleted: number
          started_at: string
          status: string
        }
        Insert: {
          batches?: number
          duration_ms?: number | null
          error_code?: string | null
          events_deleted?: number
          finished_at?: string | null
          id?: number
          job: string
          notifications_deleted?: number
          started_at?: string
          status: string
        }
        Update: {
          batches?: number
          duration_ms?: number | null
          error_code?: string | null
          events_deleted?: number
          finished_at?: string | null
          id?: number
          job?: string
          notifications_deleted?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          analysis_ready: boolean
          announcements: boolean
          coach: boolean
          created_at: string
          demo_processing: boolean
          email_consent_at: string | null
          email_consent_revoked_at: string | null
          email_enabled: boolean
          evolution: boolean
          marketing_consent: boolean
          marketing_consent_at: string | null
          max_per_day: number
          operational: boolean
          paused_until: string | null
          training: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_ready?: boolean
          announcements?: boolean
          coach?: boolean
          created_at?: string
          demo_processing?: boolean
          email_consent_at?: string | null
          email_consent_revoked_at?: string | null
          email_enabled?: boolean
          evolution?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          max_per_day?: number
          operational?: boolean
          paused_until?: string | null
          training?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_ready?: boolean
          announcements?: boolean
          coach?: boolean
          created_at?: string
          demo_processing?: boolean
          email_consent_at?: string | null
          email_consent_revoked_at?: string | null
          email_enabled?: boolean
          evolution?: boolean
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          max_per_day?: number
          operational?: boolean
          paused_until?: string | null
          training?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_segments: {
        Row: {
          created_at: string
          created_by: string
          estimated_at: string | null
          estimated_count: number | null
          id: string
          name: string
          spec: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          estimated_at?: string | null
          estimated_count?: number | null
          id?: string
          name: string
          spec: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          estimated_at?: string | null
          estimated_count?: number | null
          id?: string
          name?: string
          spec?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_segments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          channel: string
          contract_version: string
          created_at: string
          event_id: string
          id: string
          link: string
          params: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          category: string
          channel?: string
          contract_version?: string
          created_at?: string
          event_id: string
          id?: string
          link: string
          params?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          category?: string
          channel?: string
          contract_version?: string
          created_at?: string
          event_id?: string
          id?: string
          link?: string
          params?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connection_states: {
        Row: {
          browser_binding_hash: string | null
          code_verifier: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          provider: Database["public"]["Enums"]["data_source"]
          purpose: string
          redirect_uri: string
          state_hash: string
          user_id: string | null
        }
        Insert: {
          browser_binding_hash?: string | null
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          provider: Database["public"]["Enums"]["data_source"]
          purpose?: string
          redirect_uri: string
          state_hash: string
          user_id?: string | null
        }
        Update: {
          browser_binding_hash?: string | null
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["data_source"]
          purpose?: string
          redirect_uri?: string
          state_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
      parser_attestation_nonces: {
        Row: {
          attestation_digest: string
          attested_at: string
          created_at: string
          expires_at: string
          nonce: string
          workflow_run_attempt: string
          workflow_run_id: string
        }
        Insert: {
          attestation_digest: string
          attested_at: string
          created_at?: string
          expires_at: string
          nonce: string
          workflow_run_attempt: string
          workflow_run_id: string
        }
        Update: {
          attestation_digest?: string
          attested_at?: string
          created_at?: string
          expires_at?: string
          nonce?: string
          workflow_run_attempt?: string
          workflow_run_id?: string
        }
        Relationships: []
      }
      parser_runtime_provenance: {
        Row: {
          app_source_commit: string | null
          attestation_digest: string
          attestation_payload: Json | null
          attestation_signature: string | null
          attestation_version: number
          attestor_identity: Json | null
          build_revision: string
          contract_version: number
          created_at: string
          critical_source_hashes: Json
          deployment_commit: string
          deployment_id: string
          deployment_proof: Json
          git_tree: string | null
          id: string
          mapping_release_id: string | null
          parser_name: string
          parser_version: string
          railway_branch: string
          railway_environment_id: string
          railway_project_id: string
          railway_service_id: string
          release_gate_evidence: Json
          repository_full_name: string
          runtime_proof: Json
          semantic_revision: string
          source_proof: Json
          status: string
          verification_method: string
          verification_timestamp: string
          verified_endpoint: string
          workflow_identity: Json | null
        }
        Insert: {
          app_source_commit?: string | null
          attestation_digest: string
          attestation_payload?: Json | null
          attestation_signature?: string | null
          attestation_version: number
          attestor_identity?: Json | null
          build_revision: string
          contract_version: number
          created_at?: string
          critical_source_hashes: Json
          deployment_commit: string
          deployment_id: string
          deployment_proof: Json
          git_tree?: string | null
          id?: string
          mapping_release_id?: string | null
          parser_name: string
          parser_version: string
          railway_branch: string
          railway_environment_id: string
          railway_project_id: string
          railway_service_id: string
          release_gate_evidence?: Json
          repository_full_name: string
          runtime_proof: Json
          semantic_revision: string
          source_proof: Json
          status: string
          verification_method: string
          verification_timestamp: string
          verified_endpoint: string
          workflow_identity?: Json | null
        }
        Update: {
          app_source_commit?: string | null
          attestation_digest?: string
          attestation_payload?: Json | null
          attestation_signature?: string | null
          attestation_version?: number
          attestor_identity?: Json | null
          build_revision?: string
          contract_version?: number
          created_at?: string
          critical_source_hashes?: Json
          deployment_commit?: string
          deployment_id?: string
          deployment_proof?: Json
          git_tree?: string | null
          id?: string
          mapping_release_id?: string | null
          parser_name?: string
          parser_version?: string
          railway_branch?: string
          railway_environment_id?: string
          railway_project_id?: string
          railway_service_id?: string
          release_gate_evidence?: Json
          repository_full_name?: string
          runtime_proof?: Json
          semantic_revision?: string
          source_proof?: Json
          status?: string
          verification_method?: string
          verification_timestamp?: string
          verified_endpoint?: string
          workflow_identity?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "parser_runtime_provenance_mapping_release_id_fkey"
            columns: ["mapping_release_id"]
            isOneToOne: false
            referencedRelation: "canonical_mapping_inventory_releases"
            referencedColumns: ["release_id"]
          },
        ]
      }
      player_achievements: {
        Row: {
          achieved_at: string
          achieved_value: number
          dedupe_key: string
          direction: string
          evidence: Json
          goal_id: string | null
          id: string
          kind: string
          metric: string
          period_from: string
          period_to: string
          player_id: string
          sample_matches: number
          target: number
          window_matches: number
        }
        Insert: {
          achieved_at?: string
          achieved_value: number
          dedupe_key: string
          direction: string
          evidence?: Json
          goal_id?: string | null
          id?: string
          kind: string
          metric: string
          period_from: string
          period_to: string
          player_id: string
          sample_matches: number
          target: number
          window_matches: number
        }
        Update: {
          achieved_at?: string
          achieved_value?: number
          dedupe_key?: string
          direction?: string
          evidence?: Json
          goal_id?: string | null
          id?: string
          kind?: string
          metric?: string
          period_from?: string
          period_to?: string
          player_id?: string
          sample_matches?: number
          target?: number
          window_matches?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "player_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_connections: {
        Row: {
          connected_at: string | null
          connection_type: Database["public"]["Enums"]["connection_type"]
          created_at: string
          disconnected_at: string | null
          external_id: string | null
          external_username: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          metadata: Json
          player_id: string
          profile_locator_type: string | null
          profile_slug: string | null
          profile_url: string | null
          source: Database["public"]["Enums"]["data_source"]
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connection_type: Database["public"]["Enums"]["connection_type"]
          created_at?: string
          disconnected_at?: string | null
          external_id?: string | null
          external_username?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          player_id: string
          profile_locator_type?: string | null
          profile_slug?: string | null
          profile_url?: string | null
          source: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connection_type?: Database["public"]["Enums"]["connection_type"]
          created_at?: string
          disconnected_at?: string | null
          external_id?: string | null
          external_username?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          metadata?: Json
          player_id?: string
          profile_locator_type?: string | null
          profile_slug?: string | null
          profile_url?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_connections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_dna_snapshots: {
        Row: {
          aim: number | null
          analysis_id: string | null
          clutch: number | null
          consistency: number | null
          created_at: string
          decision_making: number | null
          dna_version: string | null
          dueling: number | null
          economy: number | null
          feature_versions: string[] | null
          id: string
          input_digest: string | null
          match_count: number | null
          partial_matches: number | null
          player_id: string
          positioning: number | null
          round_count: number | null
          source_match_ids: string[] | null
          state: string | null
          survivability: number | null
          teamplay: number | null
          utility: number | null
        }
        Insert: {
          aim?: number | null
          analysis_id?: string | null
          clutch?: number | null
          consistency?: number | null
          created_at?: string
          decision_making?: number | null
          dna_version?: string | null
          dueling?: number | null
          economy?: number | null
          feature_versions?: string[] | null
          id?: string
          input_digest?: string | null
          match_count?: number | null
          partial_matches?: number | null
          player_id: string
          positioning?: number | null
          round_count?: number | null
          source_match_ids?: string[] | null
          state?: string | null
          survivability?: number | null
          teamplay?: number | null
          utility?: number | null
        }
        Update: {
          aim?: number | null
          analysis_id?: string | null
          clutch?: number | null
          consistency?: number | null
          created_at?: string
          decision_making?: number | null
          dna_version?: string | null
          dueling?: number | null
          economy?: number | null
          feature_versions?: string[] | null
          id?: string
          input_digest?: string | null
          match_count?: number | null
          partial_matches?: number | null
          player_id?: string
          positioning?: number | null
          round_count?: number | null
          source_match_ids?: string[] | null
          state?: string | null
          survivability?: number | null
          teamplay?: number | null
          utility?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_dna_snapshots_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_dna_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_goals: {
        Row: {
          created_at: string
          deadline: string | null
          direction: string
          id: string
          metric: string
          player_id: string
          reminder: string
          reminder_weekday: number | null
          target: number
          updated_at: string
          window_matches: number
        }
        Insert: {
          created_at?: string
          deadline?: string | null
          direction: string
          id?: string
          metric: string
          player_id: string
          reminder?: string
          reminder_weekday?: number | null
          target: number
          updated_at?: string
          window_matches?: number
        }
        Update: {
          created_at?: string
          deadline?: string | null
          direction?: string
          id?: string
          metric?: string
          player_id?: string
          reminder?: string
          reminder_weekday?: number | null
          target?: number
          updated_at?: string
          window_matches?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_identities: {
        Row: {
          confidence_score: number
          created_at: string
          external_id: string | null
          id: string
          identity_status: Database["public"]["Enums"]["identity_link_status"]
          is_verified: boolean
          platform: Database["public"]["Enums"]["platform_kind"]
          player_id: string
          profile_locator_type: string | null
          profile_slug: string | null
          profile_url: string | null
          updated_at: string
          username: string | null
          verification_method: string | null
          verified_at: string | null
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          external_id?: string | null
          id?: string
          identity_status?: Database["public"]["Enums"]["identity_link_status"]
          is_verified?: boolean
          platform: Database["public"]["Enums"]["platform_kind"]
          player_id: string
          profile_locator_type?: string | null
          profile_slug?: string | null
          profile_url?: string | null
          updated_at?: string
          username?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          external_id?: string | null
          id?: string
          identity_status?: Database["public"]["Enums"]["identity_link_status"]
          is_verified?: boolean
          platform?: Database["public"]["Enums"]["platform_kind"]
          player_id?: string
          profile_locator_type?: string | null
          profile_slug?: string | null
          profile_url?: string | null
          updated_at?: string
          username?: string | null
          verification_method?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_identities_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_nickname_history: {
        Row: {
          confidence_label: string | null
          confidence_score: number | null
          created_at: string
          first_job_id: string | null
          first_match_id: string | null
          first_seen_at: string
          first_upload_id: string | null
          id: string
          last_job_id: string | null
          last_match_id: string | null
          last_seen_at: string
          last_upload_id: string | null
          metadata: Json
          method: string | null
          nickname: string
          normalized_nickname: string
          player_id: string
          source: string
          steam_id: string | null
          times_seen: number
          updated_at: string
        }
        Insert: {
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          first_job_id?: string | null
          first_match_id?: string | null
          first_seen_at?: string
          first_upload_id?: string | null
          id?: string
          last_job_id?: string | null
          last_match_id?: string | null
          last_seen_at?: string
          last_upload_id?: string | null
          metadata?: Json
          method?: string | null
          nickname: string
          normalized_nickname: string
          player_id: string
          source: string
          steam_id?: string | null
          times_seen?: number
          updated_at?: string
        }
        Update: {
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          first_job_id?: string | null
          first_match_id?: string | null
          first_seen_at?: string
          first_upload_id?: string | null
          id?: string
          last_job_id?: string | null
          last_match_id?: string | null
          last_seen_at?: string
          last_upload_id?: string | null
          metadata?: Json
          method?: string | null
          nickname?: string
          normalized_nickname?: string
          player_id?: string
          source?: string
          steam_id?: string | null
          times_seen?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_nickname_history_first_job_id_fkey"
            columns: ["first_job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_first_match_id_fkey"
            columns: ["first_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_first_upload_id_fkey"
            columns: ["first_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_last_match_id_fkey"
            columns: ["last_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_last_upload_id_fkey"
            columns: ["last_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_nickname_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profile_goals: {
        Row: {
          created_at: string
          goal_code: string
          id: string
          is_primary: boolean
          player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal_code: string
          id?: string
          is_primary?: boolean
          player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal_code?: string
          id?: string
          is_primary?: boolean
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profile_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profile_roles: {
        Row: {
          created_at: string
          id: string
          player_id: string
          role_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          role_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          role_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profile_roles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          competitive_goal: string | null
          country: string | null
          created_at: string
          current_level: string | null
          experience: string | null
          faceit_player_id: string | null
          faceit_username: string | null
          gamersclub_player_id: string | null
          gamersclub_username: string | null
          id: string
          main_platform: string | null
          nickname: string | null
          role: string | null
          steam_id: string | null
          team: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          competitive_goal?: string | null
          country?: string | null
          created_at?: string
          current_level?: string | null
          experience?: string | null
          faceit_player_id?: string | null
          faceit_username?: string | null
          gamersclub_player_id?: string | null
          gamersclub_username?: string | null
          id?: string
          main_platform?: string | null
          nickname?: string | null
          role?: string | null
          steam_id?: string | null
          team?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          competitive_goal?: string | null
          country?: string | null
          created_at?: string
          current_level?: string | null
          experience?: string | null
          faceit_player_id?: string | null
          faceit_username?: string | null
          gamersclub_player_id?: string | null
          gamersclub_username?: string | null
          id?: string
          main_platform?: string | null
          nickname?: string | null
          role?: string | null
          steam_id?: string | null
          team?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_score_snapshots: {
        Row: {
          analysis_id: string | null
          created_at: string
          id: string
          percentile: number | null
          player_id: string
          score: number
          tier: string | null
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          id?: string
          percentile?: number | null
          player_id: string
          score: number
          tier?: string | null
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          id?: string
          percentile?: number | null
          player_id?: string
          score?: number
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_score_snapshots_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_score_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_login_at: string | null
          locale: string
          nickname: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_login_at?: string | null
          locale?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_login_at?: string | null
          locale?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      r5_forensic_staging: {
        Row: {
          blocked_reason: string | null
          bucket_id: string
          bytes_readable: boolean
          bytes_uploaded: number
          bytes_verified_at: string | null
          created_at: string
          deleted_at: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id: string
          last_error_code: string | null
          last_error_message_safe: string | null
          metadata_digest: string | null
          object_private: boolean
          observed_sha256: string | null
          observed_size: number | null
          release_id: string
          source: string
          status: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status: string
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_started_at: string | null
          verification_started_at: string | null
        }
        Insert: {
          blocked_reason?: string | null
          bucket_id?: string
          bytes_readable?: boolean
          bytes_uploaded?: number
          bytes_verified_at?: string | null
          created_at?: string
          deleted_at?: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id?: string
          last_error_code?: string | null
          last_error_message_safe?: string | null
          metadata_digest?: string | null
          object_private?: boolean
          observed_sha256?: string | null
          observed_size?: number | null
          release_id: string
          source: string
          status?: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status?: string
          upload_attempt_count?: number
          upload_completed_at?: string | null
          upload_started_at?: string | null
          verification_started_at?: string | null
        }
        Update: {
          blocked_reason?: string | null
          bucket_id?: string
          bytes_readable?: boolean
          bytes_uploaded?: number
          bytes_verified_at?: string | null
          created_at?: string
          deleted_at?: string | null
          demo_sha256?: string
          expires_at?: string
          file_size?: number
          filename?: string
          id?: string
          last_error_code?: string | null
          last_error_message_safe?: string | null
          metadata_digest?: string | null
          object_private?: boolean
          observed_sha256?: string | null
          observed_size?: number | null
          release_id?: string
          source?: string
          status?: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path?: string
          transport_status?: string
          upload_attempt_count?: number
          upload_completed_at?: string | null
          upload_started_at?: string | null
          verification_started_at?: string | null
        }
        Relationships: []
      }
      raw_admission_decisions: {
        Row: {
          artifact_id: string
          artifact_root_digest: string
          attempt_number: number
          blocked_reasons: string[]
          contract: string
          decision: Json
          decision_digest: string
          demo_sha256: string
          excluded_metrics: string[]
          id: string
          job_id: string
          limitations: string[]
          recorded_at: string
          ruleset_version: number
          upload_id: string
          v2_contract_digest: string | null
          v2_producer_reasons: string[]
          verdict: string
        }
        Insert: {
          artifact_id: string
          artifact_root_digest: string
          attempt_number: number
          blocked_reasons?: string[]
          contract: string
          decision: Json
          decision_digest: string
          demo_sha256: string
          excluded_metrics?: string[]
          id?: string
          job_id: string
          limitations?: string[]
          recorded_at?: string
          ruleset_version: number
          upload_id: string
          v2_contract_digest?: string | null
          v2_producer_reasons: string[]
          verdict: string
        }
        Update: {
          artifact_id?: string
          artifact_root_digest?: string
          attempt_number?: number
          blocked_reasons?: string[]
          contract?: string
          decision?: Json
          decision_digest?: string
          demo_sha256?: string
          excluded_metrics?: string[]
          id?: string
          job_id?: string
          limitations?: string[]
          recorded_at?: string
          ruleset_version?: number
          upload_id?: string
          v2_contract_digest?: string | null
          v2_producer_reasons?: string[]
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_admission_decisions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "raw_evidence_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_admission_decisions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_demo_evidence_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_for_canonical: boolean
          attempt: number
          audit_version: number
          audited_evidence_digest: string
          contract_version: number
          created_at: string
          demo_sha256: string
          deterministic_digest: string
          economy_coverage: Json
          event_coverage: Json
          evidence_version: number
          field_mappings: Json
          forensic_inventory: Json
          gates: Json
          grenade_coverage: Json
          grenade_samples: Json
          id: string
          job_id: string
          manifest: Json
          parser_name: string
          parser_revision: string | null
          parser_version: string
          player_coverage: Json
          raw_audit_status: string
          raw_block_reasons: Json
          raw_events: Json
          raw_player_info: Json
          raw_status: string
          round_evidence: Json
          tick_coverage: Json
          tick_samples: Json
          updated_at: string
          upload_id: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_for_canonical?: boolean
          attempt?: number
          audit_version?: number
          audited_evidence_digest: string
          contract_version: number
          created_at?: string
          demo_sha256: string
          deterministic_digest: string
          economy_coverage?: Json
          event_coverage?: Json
          evidence_version?: number
          field_mappings?: Json
          forensic_inventory?: Json
          gates?: Json
          grenade_coverage?: Json
          grenade_samples?: Json
          id?: string
          job_id: string
          manifest: Json
          parser_name: string
          parser_revision?: string | null
          parser_version: string
          player_coverage?: Json
          raw_audit_status?: string
          raw_block_reasons?: Json
          raw_events?: Json
          raw_player_info?: Json
          raw_status?: string
          round_evidence?: Json
          tick_coverage?: Json
          tick_samples?: Json
          updated_at?: string
          upload_id: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_for_canonical?: boolean
          attempt?: number
          audit_version?: number
          audited_evidence_digest?: string
          contract_version?: number
          created_at?: string
          demo_sha256?: string
          deterministic_digest?: string
          economy_coverage?: Json
          event_coverage?: Json
          evidence_version?: number
          field_mappings?: Json
          forensic_inventory?: Json
          gates?: Json
          grenade_coverage?: Json
          grenade_samples?: Json
          id?: string
          job_id?: string
          manifest?: Json
          parser_name?: string
          parser_revision?: string | null
          parser_version?: string
          player_coverage?: Json
          raw_audit_status?: string
          raw_block_reasons?: Json
          raw_events?: Json
          raw_player_info?: Json
          raw_status?: string
          round_evidence?: Json
          tick_coverage?: Json
          tick_samples?: Json
          updated_at?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_demo_evidence_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_demo_evidence_reports_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_demo_evidence_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_evidence_artifacts: {
        Row: {
          attempt_number: number
          audit_status: string
          created_at: string
          demo_sha256: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          job_id: string
          manifest_storage_path: string
          raw_status: string
          ready_at: string | null
          root_digest: string | null
          schema_version: number
          status: string
          storage_bucket: string
          storage_prefix: string
          total_bytes: number
          total_chunks: number
          total_rows: number
          updated_at: string
          upload_id: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          audit_status?: string
          created_at?: string
          demo_sha256: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id: string
          manifest_storage_path: string
          raw_status?: string
          ready_at?: string | null
          root_digest?: string | null
          schema_version: number
          status?: string
          storage_bucket: string
          storage_prefix: string
          total_bytes?: number
          total_chunks?: number
          total_rows?: number
          updated_at?: string
          upload_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          audit_status?: string
          created_at?: string
          demo_sha256?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_id?: string
          manifest_storage_path?: string
          raw_status?: string
          ready_at?: string | null
          root_digest?: string | null
          schema_version?: number
          status?: string
          storage_bucket?: string
          storage_prefix?: string
          total_bytes?: number
          total_chunks?: number
          total_rows?: number
          updated_at?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_evidence_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_evidence_artifacts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_evidence_chunks: {
        Row: {
          artifact_id: string
          byte_size: number
          chunk_index: number
          created_at: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          first_row: number | null
          id: string
          last_row: number | null
          physical_summary: Json | null
          previous_chunk_sha256: string | null
          row_count: number
          section: string
          sha256: string
          status: string
          storage_path: string
          uploaded_at: string | null
          verified_at: string | null
        }
        Insert: {
          artifact_id: string
          byte_size?: number
          chunk_index: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          first_row?: number | null
          id?: string
          last_row?: number | null
          physical_summary?: Json | null
          previous_chunk_sha256?: string | null
          row_count?: number
          section: string
          sha256: string
          status?: string
          storage_path: string
          uploaded_at?: string | null
          verified_at?: string | null
        }
        Update: {
          artifact_id?: string
          byte_size?: number
          chunk_index?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          first_row?: number | null
          id?: string
          last_row?: number | null
          physical_summary?: Json | null
          previous_chunk_sha256?: string | null
          row_count?: number
          section?: string
          sha256?: string
          status?: string
          storage_path?: string
          uploaded_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_evidence_chunks_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "raw_evidence_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      round_events: {
        Row: {
          actor_steam_id: string | null
          assister_steam_id: string | null
          created_at: string
          damage: number | null
          data: Json
          distance: number | null
          event_type: string
          headshot: boolean | null
          id: string
          match_id: string
          match_source_id: string | null
          quality: Json
          round_id: string | null
          round_number: number
          source_actor_external_id: string | null
          source_assister_external_id: string | null
          source_victim_external_id: string | null
          tick: number | null
          time_seconds: number | null
          victim_steam_id: string | null
          weapon: string | null
        }
        Insert: {
          actor_steam_id?: string | null
          assister_steam_id?: string | null
          created_at?: string
          damage?: number | null
          data?: Json
          distance?: number | null
          event_type: string
          headshot?: boolean | null
          id?: string
          match_id: string
          match_source_id?: string | null
          quality?: Json
          round_id?: string | null
          round_number: number
          source_actor_external_id?: string | null
          source_assister_external_id?: string | null
          source_victim_external_id?: string | null
          tick?: number | null
          time_seconds?: number | null
          victim_steam_id?: string | null
          weapon?: string | null
        }
        Update: {
          actor_steam_id?: string | null
          assister_steam_id?: string | null
          created_at?: string
          damage?: number | null
          data?: Json
          distance?: number | null
          event_type?: string
          headshot?: boolean | null
          id?: string
          match_id?: string
          match_source_id?: string | null
          quality?: Json
          round_id?: string | null
          round_number?: number
          source_actor_external_id?: string | null
          source_assister_external_id?: string | null
          source_victim_external_id?: string | null
          tick?: number | null
          time_seconds?: number | null
          victim_steam_id?: string | null
          weapon?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_events_match_source_id_fkey"
            columns: ["match_source_id"]
            isOneToOne: false
            referencedRelation: "match_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "match_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_players: {
        Row: {
          assists: number | null
          buy_context: string | null
          created_at: string
          damage: number | null
          deaths: number | null
          equipment_value: number | null
          flash_assists: number | null
          id: string
          internal_player_id: string | null
          kills: number | null
          match_id: string
          metadata: Json
          money_end: number | null
          money_start: number | null
          opening_death: boolean | null
          opening_kill: boolean | null
          participant_key: string
          round_id: string | null
          round_number: number
          side: string | null
          survived: boolean | null
          trade_kill: boolean | null
          traded: boolean | null
        }
        Insert: {
          assists?: number | null
          buy_context?: string | null
          created_at?: string
          damage?: number | null
          deaths?: number | null
          equipment_value?: number | null
          flash_assists?: number | null
          id?: string
          internal_player_id?: string | null
          kills?: number | null
          match_id: string
          metadata?: Json
          money_end?: number | null
          money_start?: number | null
          opening_death?: boolean | null
          opening_kill?: boolean | null
          participant_key: string
          round_id?: string | null
          round_number: number
          side?: string | null
          survived?: boolean | null
          trade_kill?: boolean | null
          traded?: boolean | null
        }
        Update: {
          assists?: number | null
          buy_context?: string | null
          created_at?: string
          damage?: number | null
          deaths?: number | null
          equipment_value?: number | null
          flash_assists?: number | null
          id?: string
          internal_player_id?: string | null
          kills?: number | null
          match_id?: string
          metadata?: Json
          money_end?: number | null
          money_start?: number | null
          opening_death?: boolean | null
          opening_kill?: boolean | null
          participant_key?: string
          round_id?: string | null
          round_number?: number
          side?: string | null
          survived?: boolean | null
          trade_kill?: boolean | null
          traded?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "round_players_internal_player_id_fkey"
            columns: ["internal_player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "match_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_trajectories: {
        Row: {
          created_at: string
          dropped_players: number
          end_tick: number
          first_tick: number
          match_id: string
          players: Json
          round_number: number
          sample_count: number
          step_ticks: number
        }
        Insert: {
          created_at?: string
          dropped_players?: number
          end_tick: number
          first_tick: number
          match_id: string
          players: Json
          round_number: number
          sample_count: number
          step_ticks: number
        }
        Update: {
          created_at?: string
          dropped_players?: number
          end_tick?: number
          first_tick?: number
          match_id?: string
          players?: Json
          round_number?: number
          sample_count?: number
          step_ticks?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_trajectories_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_trajectories"
            referencedColumns: ["match_id"]
          },
        ]
      }
      skill_translations: {
        Row: {
          description: string | null
          locale: string
          name: string
          skill_id: string
        }
        Insert: {
          description?: string | null
          locale: string
          name: string
          skill_id: string
        }
        Update: {
          description?: string | null
          locale?: string
          name?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_translations_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          active: boolean
          id: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      steam_callback_events: {
        Row: {
          client_hash: string
          created_at: string
          id: string
          outcome: string
        }
        Insert: {
          client_hash: string
          created_at?: string
          id?: string
          outcome?: string
        }
        Update: {
          client_hash?: string
          created_at?: string
          id?: string
          outcome?: string
        }
        Relationships: []
      }
      steam_link_attempts: {
        Row: {
          cancelled_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          metadata: Json
          player_id: string | null
          realm: string
          return_url: string
          state_hash: string
          status: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          metadata?: Json
          player_id?: string | null
          realm: string
          return_url: string
          state_hash: string
          status?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          player_id?: string | null
          realm?: string
          return_url?: string
          state_hash?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "steam_link_attempts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      steam_link_failures: {
        Row: {
          created_at: string
          error_code: string
          http_status: number | null
          id: number
          stage: string
        }
        Insert: {
          created_at?: string
          error_code: string
          http_status?: number | null
          id?: never
          stage: string
        }
        Update: {
          created_at?: string
          error_code?: string
          http_status?: number | null
          id?: never
          stage?: string
        }
        Relationships: []
      }
      training_plan_items: {
        Row: {
          description: string | null
          id: string
          lesson_id: string | null
          skill_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["plan_item_status"]
          target_metric: string | null
          target_value: string | null
          title: string
          training_plan_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          lesson_id?: string | null
          skill_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_item_status"]
          target_metric?: string | null
          target_value?: string | null
          title: string
          training_plan_id: string
        }
        Update: {
          description?: string | null
          id?: string
          lesson_id?: string | null
          skill_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_item_status"]
          target_metric?: string | null
          target_value?: string | null
          title?: string
          training_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plan_items_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plan_items_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plan_items_training_plan_id_fkey"
            columns: ["training_plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          analysis_id: string | null
          created_at: string
          end_date: string | null
          horizon: number
          id: string
          objective: string | null
          player_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["plan_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          end_date?: string | null
          horizon: number
          id?: string
          objective?: string | null
          player_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          end_date?: string | null
          horizon?: number
          id?: string
          objective?: string | null
          player_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          analysis_version: string | null
          attempt_number: number
          controlled_replay_copy_status: string | null
          controlled_replay_copy_verified_at: string | null
          controlled_replay_reservation_id: string | null
          controlled_replay_source_upload_id: string | null
          created_at: string
          demo_sha256: string | null
          error_code: string | null
          error_message: string | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          parser_name: string | null
          parser_version: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          replacement_reason: string | null
          schema_version: number | null
          source: Database["public"]["Enums"]["upload_source"]
          status: Database["public"]["Enums"]["upload_status"]
          storage_path: string | null
          supersedes_job_id: string | null
          type: Database["public"]["Enums"]["upload_type"]
          user_id: string
        }
        Insert: {
          analysis_version?: string | null
          attempt_number?: number
          controlled_replay_copy_status?: string | null
          controlled_replay_copy_verified_at?: string | null
          controlled_replay_reservation_id?: string | null
          controlled_replay_source_upload_id?: string | null
          created_at?: string
          demo_sha256?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parser_name?: string | null
          parser_version?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          replacement_reason?: string | null
          schema_version?: number | null
          source?: Database["public"]["Enums"]["upload_source"]
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string | null
          supersedes_job_id?: string | null
          type: Database["public"]["Enums"]["upload_type"]
          user_id: string
        }
        Update: {
          analysis_version?: string | null
          attempt_number?: number
          controlled_replay_copy_status?: string | null
          controlled_replay_copy_verified_at?: string | null
          controlled_replay_reservation_id?: string | null
          controlled_replay_source_upload_id?: string | null
          created_at?: string
          demo_sha256?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          parser_name?: string | null
          parser_version?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          replacement_reason?: string | null
          schema_version?: number | null
          source?: Database["public"]["Enums"]["upload_source"]
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string | null
          supersedes_job_id?: string | null
          type?: Database["public"]["Enums"]["upload_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploads_controlled_replay_source_upload_id_fkey"
            columns: ["controlled_replay_source_upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_supersedes_job_id_fkey"
            columns: ["supersedes_job_id"]
            isOneToOne: false
            referencedRelation: "demo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      notification_analytics_daily: {
        Row: {
          category: string | null
          day: string | null
          delivered_in_app: number | null
          events: number | null
          median_seconds_event_to_delivery: number | null
          read: number | null
          reason: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_demo_parse_dispatch: {
        Args: {
          _attempt: number
          _job_id: string
          _lifecycle: string
          _message_id: number
          _worker_id: string
        }
        Returns: Json
      }
      assert_attempt_9_authorized: {
        Args: { _staging_id?: string }
        Returns: Json
      }
      assert_cache_attempt_9_ready: {
        Args: { _provenance_id: string }
        Returns: Json
      }
      assert_canonical_mapping_gate: { Args: never; Returns: Json }
      assert_pre_attempt_9_ready: {
        Args: { _provenance_id: string }
        Returns: Json
      }
      assert_real_demo_release_ready: {
        Args: { _provenance_id: string }
        Returns: Json
      }
      assert_verified_parser_provenance: {
        Args: { _provenance_id: string }
        Returns: Json
      }
      attestation_security_invariants: { Args: never; Returns: Json }
      block_demo_job_raw_audit: {
        Args: {
          _attempt: number
          _job_id: string
          _message_id: number
          _reasons: Json
          _worker_id: string
        }
        Returns: Json
      }
      canonical_attach_source: {
        Args: {
          _external_match_id: string
          _fingerprint?: string
          _match_id: string
          _source: Database["public"]["Enums"]["data_source"]
          _source_contract_version: string
        }
        Returns: string
      }
      canonical_mapping_inventory_release_snapshot: {
        Args: never
        Returns: Json
      }
      canonical_mapping_inventory_snapshot: { Args: never; Returns: Json }
      canonical_source_priority: {
        Args: { _source: Database["public"]["Enums"]["data_source"] }
        Returns: number
      }
      catalog_url_ok: {
        Args: { _kind: string; _url: string }
        Returns: boolean
      }
      claim_demo_cleanup_job: {
        Args: { _claim_seconds?: number; _job_id: string }
        Returns: Json
      }
      claim_demo_cleanup_jobs: {
        Args: { _claim_seconds?: number; _limit?: number }
        Returns: Json
      }
      claim_demo_parse_message: {
        Args: {
          _max_concurrent?: number
          _visibility_seconds?: number
          _worker_id: string
        }
        Returns: Json
      }
      claim_demo_problem_report: {
        Args: {
          _app_version: string
          _category: string
          _details: string
          _error_code: string
          _job_id: string
          _locale: string
          _max_per_hour?: number
          _occurrence_key: string
          _page: string
          _stage: string
          _user_id: string
        }
        Returns: Json
      }
      claim_email_delivery: {
        Args: {
          _idempotency_key: string
          _kind: string
          _lease_seconds?: number
          _locale: string
          _provider: string
          _recipient: string
          _subject: string
          _user_id?: string
        }
        Returns: Json
      }
      claim_next_demo_job: {
        Args: { _max_concurrent?: number }
        Returns: string
      }
      claim_next_faceit_sync_job: {
        Args: { _max_concurrent?: number }
        Returns: string
      }
      claim_next_gamers_club_sync_job: {
        Args: { _max_concurrent?: number }
        Returns: string
      }
      claim_steam_link_slot: {
        Args: {
          _max_attempts?: number
          _user_id: string
          _window_seconds?: number
        }
        Returns: boolean
      }
      cleanup_expired_oauth_states: { Args: never; Returns: number }
      close_demo_parse_dispatch: {
        Args: {
          _allow_retry: boolean
          _job_id: string
          _lifecycle: string
          _reason: string
        }
        Returns: boolean
      }
      coach_claim_request: {
        Args: {
          p_conversation_id: string
          p_lease_seconds?: number
          p_message_sha256: string
          p_player_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: {
          attempt_count: number
          coach_message_id: string
          conversation_id: string
          lease_token: string
          outcome: string
          pending_context_type: string
          pending_reply: string
          player_message_id: string
        }[]
      }
      coach_complete_request: {
        Args: {
          p_context_type: string
          p_lease_token: string
          p_model: string
          p_provider: string
          p_question: string
          p_reply: string
          p_request_id: string
          p_title: string
        }
        Returns: {
          coach_created_at: string
          coach_message_id: string
          conversation_id: string
          player_created_at: string
          player_message_id: string
        }[]
      }
      coach_fail_request: {
        Args: {
          p_error_code: string
          p_lease_token: string
          p_request_id: string
          p_status: string
        }
        Returns: boolean
      }
      coach_persist_pending: {
        Args: {
          p_context_type: string
          p_lease_token: string
          p_model: string
          p_provider: string
          p_reply: string
          p_request_id: string
        }
        Returns: boolean
      }
      create_canonical_mapping_inventory_release: {
        Args: { _release: Json; _rows: Json }
        Returns: string
      }
      decide_demo_automatic_identity: {
        Args: {
          _action: string
          _expected_latest_event_key: string
          _job_id: string
          _user_id: string
        }
        Returns: boolean
      }
      enqueue_demo_job: {
        Args: { _upload_id: string; _user_id: string }
        Returns: Json
      }
      evaluate_demo_deletion_gate: { Args: { _job_id: string }; Returns: Json }
      fail_demo_cleanup: {
        Args: { _claim_token: string; _error_code: string; _job_id: string }
        Returns: boolean
      }
      fail_demo_parse_message: {
        Args: {
          _attempt: number
          _error_code: string
          _error_message: string
          _job_id: string
          _message_id: number
          _permanent?: boolean
          _worker_id: string
        }
        Returns: Json
      }
      finalize_controlled_demo_replay_attempt_9:
        | {
            Args: {
              _admin_user_id: string
              _copy_outcome: string
              _destination_sha256: string
              _destination_size: number
              _provenance_id: string
              _reservation_id: string
              _source_job_id: string
              _source_sha256: string
              _source_size: number
              _upload_id: string
              _user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _admin_user_id: string
              _copy_outcome: string
              _destination_sha256: string
              _destination_size: number
              _provenance_id: string
              _source_job_id: string
              _source_sha256: string
              _source_size: number
              _upload_id: string
              _user_id: string
            }
            Returns: Json
          }
      finalize_demo_parse_message: {
        Args: {
          _attempt: number
          _job_id: string
          _message_id: number
          _worker_id: string
        }
        Returns: Json
      }
      finish_demo_cleanup_verified: {
        Args: { _claim_token: string; _job_id: string; _outcome: string }
        Returns: boolean
      }
      finish_demo_job_cancelled: {
        Args: { _cleanup_error?: string; _job_id: string }
        Returns: boolean
      }
      finish_demo_job_processed: {
        Args: { _job_id: string; _result: Json }
        Returns: boolean
      }
      get_demo_cleanup_authority: { Args: never; Returns: Json }
      get_demo_orphan_report: {
        Args: { _older_than_hours?: number }
        Returns: Json
      }
      get_demo_retention_metrics: { Args: never; Returns: Json }
      h3e_predem_managed_snapshot: { Args: never; Returns: Json }
      h3e91_authoritative_execution_evidence: {
        Args: { _baseline_started_at: string }
        Returns: Json
      }
      h3e91_execution_ledger_after_baseline: {
        Args: { _baseline_started_at: string }
        Returns: Json
      }
      h3e91_live_database_evidence: { Args: never; Returns: Json }
      h3e91_read_execution_lifecycle: {
        Args: { _execution_id: string }
        Returns: Json
      }
      h3e91_record_execution_event: {
        Args: {
          _attempt_number: number
          _correlation_id: string
          _demo_sha256: string
          _event_id: string
          _event_type: string
          _event_version: number
          _execution_id: string
          _execution_surface: string
          _file_size: number
          _job_id: string
          _metadata_digest: string
          _outcome_code: string
          _parser_name: string
          _parser_revision: string
          _parser_version: string
          _source: string
          _upload_id: string
          _worker_build_commit: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_demo_parse_message: {
        Args: {
          _attempt: number
          _job_id: string
          _message_id: number
          _stage?: string
          _visibility_seconds?: number
          _worker_id: string
        }
        Returns: Json
      }
      is_admin_master: { Args: { _user_id: string }; Returns: boolean }
      is_canonical_match_quarantined: {
        Args: { _match_id: string }
        Returns: boolean
      }
      is_primary_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      iso_alpha2_codes: { Args: never; Returns: string[] }
      jsonb_has_sensitive_key: { Args: { _value: Json }; Returns: boolean }
      notification_admin_dashboard: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      notification_admin_level: { Args: never; Returns: number }
      notification_campaign_action: {
        Args: {
          p_action: string
          p_args?: Json
          p_expected_version: number
          p_id: string
        }
        Returns: Json
      }
      notification_campaign_batch: {
        Args: { p_batch: number; p_id: string; p_token: string }
        Returns: string
      }
      notification_campaign_eligible: {
        Args: { p_kind: string; p_spec: Json; p_user: string }
        Returns: boolean
      }
      notification_campaign_estimate: {
        Args: { p_kind?: string; p_spec: Json }
        Returns: number
      }
      notification_campaign_save: {
        Args: { p_expected_version: number; p_id: string; p_patch: Json }
        Returns: Json
      }
      notification_campaign_stats: { Args: { p_id: string }; Returns: Json }
      notification_campaign_test_send: {
        Args: { p_id: string; p_recipient?: string }
        Returns: Json
      }
      notification_campaign_translation_approve: {
        Args: { p_campaign: string; p_locale: string }
        Returns: undefined
      }
      notification_campaign_translation_save: {
        Args: {
          p_body: string
          p_campaign: string
          p_locale: string
          p_title: string
        }
        Returns: undefined
      }
      notification_ingest: {
        Args: { p_events: Json; p_user_id: string }
        Returns: {
          accepted: number
          duplicates: number
          rejected: number
          suppressed: number
        }[]
      }
      notification_purge_expired: {
        Args: { p_limit?: number }
        Returns: {
          events_deleted: number
          notifications_deleted: number
        }[]
      }
      notification_retention_run: {
        Args: { p_batch?: number; p_max_batches?: number }
        Returns: {
          batches: number
          events_deleted: number
          notifications_deleted: number
          status: string
        }[]
      }
      notification_segment_match: {
        Args: { p_depth?: number; p_spec: Json; p_user: string }
        Returns: boolean
      }
      notification_segment_save: {
        Args: { p_id: string; p_name: string; p_spec: Json }
        Returns: string
      }
      notification_segment_valid: {
        Args: { p_depth?: number; p_spec: Json }
        Returns: boolean
      }
      owns_analysis: { Args: { _analysis_id: string }; Returns: boolean }
      owns_canonical_match: { Args: { _match_id: string }; Returns: boolean }
      owns_canonical_series: { Args: { _series_id: string }; Returns: boolean }
      owns_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      owns_death_event: {
        Args: {
          _death_tick: number
          _match_id: string
          _round_event_id: string
          _round_number: number
        }
        Returns: boolean
      }
      owns_plan: { Args: { _plan_id: string }; Returns: boolean }
      owns_player: { Args: { _player_id: string }; Returns: boolean }
      parser_attestation_canonical_payload: {
        Args: { _attestation: Json }
        Returns: string
      }
      parser_attestation_digest: {
        Args: { _attestation: Json }
        Returns: string
      }
      persist_canonical_observation: {
        Args: { _bundle: Json; _owner_player_id?: string; _upload_id?: string }
        Returns: Json
      }
      persist_canonical_observation_attached: {
        Args: {
          _attach_match_id?: string
          _bundle: Json
          _owner_player_id?: string
          _upload_id?: string
        }
        Returns: Json
      }
      persist_canonical_series_observation: {
        Args: { _observation: Json; _owner_player_id?: string; _series: Json }
        Returns: Json
      }
      persist_demo_projection: {
        Args: {
          _features: Json
          _job_id?: string
          _job_result?: Json
          _match_id: string
          _match_wide: Json
          _metrics: Json
          _player_id: string
          _player_scoped: Json
          _steam_id: string
          _upload_id: string
        }
        Returns: string
      }
      pre_attempt_9_gate_status: {
        Args: { _provenance_id: string }
        Returns: string
      }
      pre_real_demo_gate_status: { Args: never; Returns: Json }
      prepare_r5_forensic_staging: {
        Args: never
        Returns: {
          blocked_reason: string | null
          bucket_id: string
          bytes_readable: boolean
          bytes_uploaded: number
          bytes_verified_at: string | null
          created_at: string
          deleted_at: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id: string
          last_error_code: string | null
          last_error_message_safe: string | null
          metadata_digest: string | null
          object_private: boolean
          observed_sha256: string | null
          observed_size: number | null
          release_id: string
          source: string
          status: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status: string
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_started_at: string | null
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "r5_forensic_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      r5_real_dem_access_gate: { Args: { _staging_id?: string }; Returns: Json }
      r5_real_dem_execution_gate: {
        Args: { _staging_id?: string }
        Returns: Json
      }
      reconcile_demo_parse_queue: { Args: { _limit?: number }; Returns: number }
      reconcile_orphan_demo_uploads: {
        Args: { _limit?: number; _older_than_minutes?: number }
        Returns: number
      }
      record_demo_identity_event: {
        Args: {
          _decision: Json
          _event_key: string
          _job_id: string
          _user_id: string
        }
        Returns: boolean
      }
      record_parser_runtime_attestation: {
        Args: {
          _attestation_digest: string
          _attested_at: string
          _canonical_payload: string
          _nonce: string
          _payload: Json
          _release_gate_evidence: Json
          _signature: string
        }
        Returns: string
      }
      record_parser_runtime_attestation_with_secret: {
        Args: {
          _attestation_digest: string
          _attested_at: string
          _canonical_payload: string
          _hmac_secret: string
          _nonce: string
          _payload: Json
          _release_gate_evidence: Json
          _signature: string
        }
        Returns: string
      }
      record_r5_forensic_progress: {
        Args: { _bytes_uploaded: number; _staging_id: string }
        Returns: {
          blocked_reason: string | null
          bucket_id: string
          bytes_readable: boolean
          bytes_uploaded: number
          bytes_verified_at: string | null
          created_at: string
          deleted_at: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id: string
          last_error_code: string | null
          last_error_message_safe: string | null
          metadata_digest: string | null
          object_private: boolean
          observed_sha256: string | null
          observed_size: number | null
          release_id: string
          source: string
          status: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status: string
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_started_at: string | null
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "r5_forensic_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_raw_admission_decision_v3: {
        Args: { _artifact_id: string; _decision: Json; _job_id: string }
        Returns: string
      }
      record_steam_alias: {
        Args: { _nickname: string; _player_id: string; _steam_id: string }
        Returns: boolean
      }
      recover_stale_demo_jobs: {
        Args: { _stale_minutes?: number }
        Returns: number
      }
      recover_stale_faceit_sync_jobs: {
        Args: { _max_attempts?: number; _stale_seconds?: number }
        Returns: number
      }
      recover_stale_gamers_club_sync_jobs: {
        Args: { _max_attempts?: number; _stale_seconds?: number }
        Returns: number
      }
      request_demo_job_cancel: {
        Args: { _job_id: string; _user_id: string }
        Returns: Json
      }
      requeue_demo_job_after_attachment: {
        Args: { _attachment: Json; _job_id: string; _user_id: string }
        Returns: boolean
      }
      reserve_controlled_demo_replay_attempt_9:
        | {
            Args: {
              _expected_attempt: number
              _expected_sha256: string
              _expected_size: number
              _new_upload_id: string
              _provenance_id: string
              _replay_reason: string
              _source_job_id: string
              _source_upload_id: string
              _user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              _admin_user_id: string
              _expected_attempt: number
              _expected_sha256: string
              _expected_size: number
              _new_upload_id: string
              _provenance_id: string
              _replay_reason: string
              _reservation_id: string
              _source_job_id: string
              _source_upload_id: string
              _user_id: string
            }
            Returns: Json
          }
      reserve_demo_parser_upgrade_attempt: {
        Args: {
          _demo_sha256: string
          _expected_parser_revision: string
          _file_name: string
          _file_size: number
          _upload_id: string
          _user_id: string
        }
        Returns: Json
      }
      reserve_demo_upload: {
        Args: {
          _demo_sha256: string
          _file_name: string
          _file_size: number
          _upload_id: string
          _user_id: string
        }
        Returns: Json
      }
      retry_demo_job: {
        Args: {
          _allow_permanent?: boolean
          _job_id: string
          _reason?: string
          _user_id: string
        }
        Returns: Json
      }
      save_player_profile: {
        Args: {
          _country: string
          _current_level: string
          _display_name: string
          _experience: string
          _goal_codes: string[]
          _main_platform: string
          _nickname: string
          _primary_goal: string
          _role_codes: string[]
          _team: string
        }
        Returns: string
      }
      steam_link_commit: {
        Args: {
          _audit?: Json
          _connection: Json
          _correlations?: Json
          _evidence?: Json
          _identity: Json
          _player_id: string
          _steam_id: string
          _user_id: string
        }
        Returns: Json
      }
      steam_unlink_commit: {
        Args: { _audit?: Json; _player_id: string; _user_id: string }
        Returns: Json
      }
      transition_r5_forensic_upload: {
        Args: { _action: string; _error_code?: string; _staging_id: string }
        Returns: {
          blocked_reason: string | null
          bucket_id: string
          bytes_readable: boolean
          bytes_uploaded: number
          bytes_verified_at: string | null
          created_at: string
          deleted_at: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id: string
          last_error_code: string | null
          last_error_message_safe: string | null
          metadata_digest: string | null
          object_private: boolean
          observed_sha256: string | null
          observed_size: number | null
          release_id: string
          source: string
          status: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status: string
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_started_at: string | null
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "r5_forensic_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_r5_forensic_verification: {
        Args: {
          _action: string
          _error_code?: string
          _metadata_digest?: string
          _observed_sha256?: string
          _observed_size?: number
          _staging_id: string
        }
        Returns: {
          blocked_reason: string | null
          bucket_id: string
          bytes_readable: boolean
          bytes_uploaded: number
          bytes_verified_at: string | null
          created_at: string
          deleted_at: string | null
          demo_sha256: string
          expires_at: string
          file_size: number
          filename: string
          id: string
          last_error_code: string | null
          last_error_message_safe: string | null
          metadata_digest: string | null
          object_private: boolean
          observed_sha256: string | null
          observed_size: number | null
          release_id: string
          source: string
          status: Database["public"]["Enums"]["r5_forensic_staging_status"]
          storage_path: string
          transport_status: string
          upload_attempt_count: number
          upload_completed_at: string | null
          upload_started_at: string | null
          verification_started_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "r5_forensic_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_pipeline_cron_secret: {
        Args: { candidate: string }
        Returns: boolean
      }
    }
    Enums: {
      analysis_status: "pending" | "processing" | "completed" | "failed"
      app_role: "admin_master" | "admin" | "player"
      coach_role: "coach" | "player"
      connection_status:
        | "pending"
        | "connected"
        | "disconnected"
        | "expired"
        | "error"
      connection_type: "oauth" | "public_profile" | "manual" | "openid"
      data_source:
        | "demo"
        | "faceit"
        | "gamers_club"
        | "steam"
        | "public_profile"
      faceit_sync_job_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "retrying"
      faceit_sync_job_type:
        | "initial"
        | "incremental"
        | "manual"
        | "profile"
        | "match"
        | "stats"
      finding_priority: "critical" | "high" | "medium" | "low"
      finding_type: "bottleneck" | "strength" | "recommendation"
      gc_job_outcome:
        | "success"
        | "partial"
        | "failed"
        | "blocked_external_access"
        | "rate_limited"
        | "timeout"
        | "cancelled"
      gc_job_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
        | "retrying"
        | "cancelled"
      gc_job_type:
        | "gamers_club_profile_sync"
        | "gamers_club_match_history_sync"
        | "gamers_club_match_details_sync"
        | "gamers_club_stats_sync"
        | "identity_correlation_job"
      identity_link_status:
        | "unlinked"
        | "correlated"
        | "strongly_correlated"
        | "verified"
        | "conflict"
      match_result: "win" | "loss" | "draw"
      plan_item_status: "pending" | "in_progress" | "done" | "skipped"
      plan_status: "draft" | "active" | "completed" | "archived"
      platform_kind: "FACEIT" | "GAMERS_CLUB" | "STEAM"
      r5_forensic_staging_status:
        | "NOT_READY"
        | "STAGED"
        | "IDENTITY_VERIFIED"
        | "ACCESSIBLE"
        | "READY_FOR_EXECUTION"
        | "BLOCKED"
      upload_source: "manual" | "faceit" | "gamers_club" | "steam"
      upload_status:
        | "pending"
        | "processing"
        | "processed"
        | "failed"
        | "cancel_requested"
        | "cancelled"
        | "blocked_raw_audit"
      upload_type: "demo" | "screenshot" | "report"
      user_status: "active" | "inactive"
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
      analysis_status: ["pending", "processing", "completed", "failed"],
      app_role: ["admin_master", "admin", "player"],
      coach_role: ["coach", "player"],
      connection_status: [
        "pending",
        "connected",
        "disconnected",
        "expired",
        "error",
      ],
      connection_type: ["oauth", "public_profile", "manual", "openid"],
      data_source: ["demo", "faceit", "gamers_club", "steam", "public_profile"],
      faceit_sync_job_status: [
        "queued",
        "processing",
        "completed",
        "failed",
        "retrying",
      ],
      faceit_sync_job_type: [
        "initial",
        "incremental",
        "manual",
        "profile",
        "match",
        "stats",
      ],
      finding_priority: ["critical", "high", "medium", "low"],
      finding_type: ["bottleneck", "strength", "recommendation"],
      gc_job_outcome: [
        "success",
        "partial",
        "failed",
        "blocked_external_access",
        "rate_limited",
        "timeout",
        "cancelled",
      ],
      gc_job_status: [
        "queued",
        "processing",
        "completed",
        "failed",
        "retrying",
        "cancelled",
      ],
      gc_job_type: [
        "gamers_club_profile_sync",
        "gamers_club_match_history_sync",
        "gamers_club_match_details_sync",
        "gamers_club_stats_sync",
        "identity_correlation_job",
      ],
      identity_link_status: [
        "unlinked",
        "correlated",
        "strongly_correlated",
        "verified",
        "conflict",
      ],
      match_result: ["win", "loss", "draw"],
      plan_item_status: ["pending", "in_progress", "done", "skipped"],
      plan_status: ["draft", "active", "completed", "archived"],
      platform_kind: ["FACEIT", "GAMERS_CLUB", "STEAM"],
      r5_forensic_staging_status: [
        "NOT_READY",
        "STAGED",
        "IDENTITY_VERIFIED",
        "ACCESSIBLE",
        "READY_FOR_EXECUTION",
        "BLOCKED",
      ],
      upload_source: ["manual", "faceit", "gamers_club", "steam"],
      upload_status: [
        "pending",
        "processing",
        "processed",
        "failed",
        "cancel_requested",
        "cancelled",
        "blocked_raw_audit",
      ],
      upload_type: ["demo", "screenshot", "report"],
      user_status: ["active", "inactive"],
    },
  },
} as const
