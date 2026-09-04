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
      demo_jobs: {
        Row: {
          analysis_version: string
          cleanup_error: string | null
          created_at: string
          demo_sha256: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          events_detected: number | null
          extraction_confidence: number | null
          file_size: number | null
          finished_at: string | null
          id: string
          identity_status: string
          match_id: string | null
          max_retries: number
          parser_name: string | null
          parser_revision: string | null
          parser_version: string | null
          partial_parse: boolean
          player_id: string | null
          players_detected: number | null
          quality_flags: Json
          queued_at: string
          resolved_steam_id: string | null
          retain_until: string | null
          retry_count: number
          rounds_detected: number | null
          rounds_valid: number | null
          schema_version: number
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["upload_status"]
          storage_deleted_at: string | null
          storage_path: string | null
          updated_at: string
          upload_id: string
          user_id: string
        }
        Insert: {
          analysis_version?: string
          cleanup_error?: string | null
          created_at?: string
          demo_sha256?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          events_detected?: number | null
          extraction_confidence?: number | null
          file_size?: number | null
          finished_at?: string | null
          id?: string
          identity_status?: string
          match_id?: string | null
          max_retries?: number
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          partial_parse?: boolean
          player_id?: string | null
          players_detected?: number | null
          quality_flags?: Json
          queued_at?: string
          resolved_steam_id?: string | null
          retain_until?: string | null
          retry_count?: number
          rounds_detected?: number | null
          rounds_valid?: number | null
          schema_version?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_deleted_at?: string | null
          storage_path?: string | null
          updated_at?: string
          upload_id: string
          user_id: string
        }
        Update: {
          analysis_version?: string
          cleanup_error?: string | null
          created_at?: string
          demo_sha256?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          events_detected?: number | null
          extraction_confidence?: number | null
          file_size?: number | null
          finished_at?: string | null
          id?: string
          identity_status?: string
          match_id?: string | null
          max_retries?: number
          parser_name?: string | null
          parser_revision?: string | null
          parser_version?: string | null
          partial_parse?: boolean
          player_id?: string | null
          players_detected?: number | null
          quality_flags?: Json
          queued_at?: string
          resolved_steam_id?: string | null
          retain_until?: string | null
          retry_count?: number
          rounds_detected?: number | null
          rounds_valid?: number | null
          schema_version?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_deleted_at?: string | null
          storage_path?: string | null
          updated_at?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
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
          sample_clutches: number
          sample_opening_duels: number
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
          sample_clutches?: number
          sample_opening_duels?: number
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
          sample_clutches?: number
          sample_opening_duels?: number
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
      match_rounds: {
        Row: {
          bomb_defused: boolean
          bomb_exploded: boolean
          bomb_planted: boolean
          buy_context: string | null
          created_at: string
          duration_seconds: number | null
          end_tick: number | null
          id: string
          match_id: string
          player_equipment_value: number | null
          player_money_end: number | null
          player_money_start: number | null
          player_side: string | null
          player_survived: boolean | null
          round_number: number
          start_tick: number | null
          winner_side: string | null
          winner_team: string | null
        }
        Insert: {
          bomb_defused?: boolean
          bomb_exploded?: boolean
          bomb_planted?: boolean
          buy_context?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_tick?: number | null
          id?: string
          match_id: string
          player_equipment_value?: number | null
          player_money_end?: number | null
          player_money_start?: number | null
          player_side?: string | null
          player_survived?: boolean | null
          round_number: number
          start_tick?: number | null
          winner_side?: string | null
          winner_team?: string | null
        }
        Update: {
          bomb_defused?: boolean
          bomb_exploded?: boolean
          bomb_planted?: boolean
          buy_context?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_tick?: number | null
          id?: string
          match_id?: string
          player_equipment_value?: number | null
          player_money_end?: number | null
          player_money_start?: number | null
          player_side?: string | null
          player_survived?: boolean | null
          round_number?: number
          start_tick?: number | null
          winner_side?: string | null
          winner_team?: string | null
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
      matches: {
        Row: {
          created_at: string
          data_source: Database["public"]["Enums"]["data_source"]
          demo_metadata: Json | null
          duration_seconds: number | null
          external_match_id: string | null
          game_version: string | null
          id: string
          map: string | null
          match_date: string | null
          platform: string | null
          player_id: string
          result: Database["public"]["Enums"]["match_result"] | null
          rounds: number | null
          score_opponent: number | null
          score_player: number | null
          source_complete: boolean
          source_fetch_attempts: number
          source_fetched_at: string | null
          source_metadata: Json | null
          source_version: string | null
          team_opponent: string | null
          team_player: string | null
          upload_id: string | null
        }
        Insert: {
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source"]
          demo_metadata?: Json | null
          duration_seconds?: number | null
          external_match_id?: string | null
          game_version?: string | null
          id?: string
          map?: string | null
          match_date?: string | null
          platform?: string | null
          player_id: string
          result?: Database["public"]["Enums"]["match_result"] | null
          rounds?: number | null
          score_opponent?: number | null
          score_player?: number | null
          source_complete?: boolean
          source_fetch_attempts?: number
          source_fetched_at?: string | null
          source_metadata?: Json | null
          source_version?: string | null
          team_opponent?: string | null
          team_player?: string | null
          upload_id?: string | null
        }
        Update: {
          created_at?: string
          data_source?: Database["public"]["Enums"]["data_source"]
          demo_metadata?: Json | null
          duration_seconds?: number | null
          external_match_id?: string | null
          game_version?: string | null
          id?: string
          map?: string | null
          match_date?: string | null
          platform?: string | null
          player_id?: string
          result?: Database["public"]["Enums"]["match_result"] | null
          rounds?: number | null
          score_opponent?: number | null
          score_player?: number | null
          source_complete?: boolean
          source_fetch_attempts?: number
          source_fetched_at?: string | null
          source_metadata?: Json | null
          source_version?: string | null
          team_opponent?: string | null
          team_player?: string | null
          upload_id?: string | null
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
            foreignKeyName: "matches_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connection_states: {
        Row: {
          code_verifier: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          provider: Database["public"]["Enums"]["data_source"]
          redirect_uri: string
          state_hash: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          provider: Database["public"]["Enums"]["data_source"]
          redirect_uri: string
          state_hash: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["data_source"]
          redirect_uri?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: []
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
          dueling: number | null
          economy: number | null
          id: string
          player_id: string
          positioning: number | null
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
          dueling?: number | null
          economy?: number | null
          id?: string
          player_id: string
          positioning?: number | null
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
          dueling?: number | null
          economy?: number | null
          id?: string
          player_id?: string
          positioning?: number | null
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
          round_id: string | null
          round_number: number
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
          round_id?: string | null
          round_number: number
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
          round_id?: string | null
          round_number?: number
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
            foreignKeyName: "round_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "match_rounds"
            referencedColumns: ["id"]
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
          schema_version: number | null
          source: Database["public"]["Enums"]["upload_source"]
          status: Database["public"]["Enums"]["upload_status"]
          storage_path: string | null
          type: Database["public"]["Enums"]["upload_type"]
          user_id: string
        }
        Insert: {
          analysis_version?: string | null
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
          schema_version?: number | null
          source?: Database["public"]["Enums"]["upload_source"]
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string | null
          type: Database["public"]["Enums"]["upload_type"]
          user_id: string
        }
        Update: {
          analysis_version?: string | null
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
          schema_version?: number | null
          source?: Database["public"]["Enums"]["upload_source"]
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string | null
          type?: Database["public"]["Enums"]["upload_type"]
          user_id?: string
        }
        Relationships: [
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
      [_ in never]: never
    }
    Functions: {
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
      cleanup_expired_oauth_states: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_master: { Args: { _user_id: string }; Returns: boolean }
      is_primary_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      jsonb_has_sensitive_key: { Args: { _value: Json }; Returns: boolean }
      owns_analysis: { Args: { _analysis_id: string }; Returns: boolean }
      owns_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      owns_plan: { Args: { _plan_id: string }; Returns: boolean }
      owns_player: { Args: { _player_id: string }; Returns: boolean }
      recover_stale_faceit_sync_jobs: {
        Args: { _max_attempts?: number; _stale_seconds?: number }
        Returns: number
      }
      recover_stale_gamers_club_sync_jobs: {
        Args: { _max_attempts?: number; _stale_seconds?: number }
        Returns: number
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
      connection_type: "oauth" | "public_profile" | "manual"
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
      upload_source: "manual" | "faceit" | "gamers_club" | "steam"
      upload_status: "pending" | "processing" | "processed" | "failed"
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
      connection_type: ["oauth", "public_profile", "manual"],
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
      upload_source: ["manual", "faceit", "gamers_club", "steam"],
      upload_status: ["pending", "processing", "processed", "failed"],
      upload_type: ["demo", "screenshot", "report"],
      user_status: ["active", "inactive"],
    },
  },
} as const
