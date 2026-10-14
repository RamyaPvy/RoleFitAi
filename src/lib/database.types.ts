export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          full_name: string | null;
          phone: string | null;
          location: string | null;
          linkedin_url: string | null;
          github_url: string | null;
          current_role: string | null;
          experience_years: number | null;
          skills: string[];
          summary: string | null;
          experience: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name?: string | null;
          phone?: string | null;
          location?: string | null;
          linkedin_url?: string | null;
          github_url?: string | null;
          current_role?: string | null;
          experience_years?: number | null;
          skills?: string[];
          summary?: string | null;
          experience?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          full_name?: string | null;
          phone?: string | null;
          location?: string | null;
          linkedin_url?: string | null;
          github_url?: string | null;
          current_role?: string | null;
          experience_years?: number | null;
          skills?: string[];
          summary?: string | null;
          experience?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      resumes: {
        Row: {
          id: string;
          user_id: string;
          file_name: string;
          storage_path: string;
          content_type: string;
          size_bytes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          file_name: string;
          storage_path: string;
          content_type: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          file_name?: string;
          storage_path?: string;
          content_type?: string;
          size_bytes?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          ats: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          board_token: string;
          active: boolean;
          last_synced_at: string | null;
          last_sync_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          ats: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          board_token: string;
          active?: boolean;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          ats?: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          board_token?: string;
          active?: boolean;
          last_synced_at?: string | null;
          last_sync_error?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          source: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          external_id: string;
          company_name: string | null;
          title: string;
          location: string | null;
          description: string | null;
          apply_url: string;
          posted_at: string | null;
          work_authorization:
            | "unknown"
            | "no_sponsorship"
            | "sponsorship_mentioned"
            | "opt_cpt_mentioned";
          work_authorization_evidence: string | null;
          is_open: boolean;
          fetched_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          source: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          external_id: string;
          company_name?: string | null;
          title: string;
          location?: string | null;
          description?: string | null;
          apply_url: string;
          posted_at?: string | null;
          work_authorization?:
            | "unknown"
            | "no_sponsorship"
            | "sponsorship_mentioned"
            | "opt_cpt_mentioned";
          work_authorization_evidence?: string | null;
          is_open?: boolean;
          fetched_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          source?: "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow";
          external_id?: string;
          company_name?: string | null;
          title?: string;
          location?: string | null;
          description?: string | null;
          apply_url?: string;
          posted_at?: string | null;
          work_authorization?:
            | "unknown"
            | "no_sponsorship"
            | "sponsorship_mentioned"
            | "opt_cpt_mentioned";
          work_authorization_evidence?: string | null;
          is_open?: boolean;
          fetched_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      applications: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          job_title: string;
          company_name: string;
          apply_url: string;
          resume_id: string | null;
          resume_file_name: string | null;
          status: "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";
          notes: string | null;
          applied_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          job_title: string;
          company_name: string;
          apply_url: string;
          resume_id?: string | null;
          resume_file_name?: string | null;
          status?: "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";
          notes?: string | null;
          applied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_id?: string | null;
          job_title?: string;
          company_name?: string;
          apply_url?: string;
          resume_id?: string | null;
          resume_file_name?: string | null;
          status?: "saved" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn";
          notes?: string | null;
          applied_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tailored_resumes: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          source_resume_id: string | null;
          company_name: string;
          job_title: string;
          apply_url: string;
          file_name: string;
          storage_path: string;
          summary: string | null;
          gaps: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          source_resume_id?: string | null;
          company_name: string;
          job_title: string;
          apply_url: string;
          file_name: string;
          storage_path: string;
          summary?: string | null;
          gaps?: string[];
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      application_answers: {
        Row: {
          user_id: string;
          country: string | null;
          authorized_to_work: "yes" | "no" | null;
          needs_sponsorship: "yes" | "no" | null;
          open_to_relocate: "yes" | "no" | null;
          how_heard: string | null;
          notice_period: string | null;
          salary_expectation: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          country?: string | null;
          authorized_to_work?: "yes" | "no" | null;
          needs_sponsorship?: "yes" | "no" | null;
          open_to_relocate?: "yes" | "no" | null;
          how_heard?: string | null;
          notice_period?: string | null;
          salary_expectation?: string | null;
          updated_at?: string;
        };
        Update: {
          country?: string | null;
          authorized_to_work?: "yes" | "no" | null;
          needs_sponsorship?: "yes" | "no" | null;
          open_to_relocate?: "yes" | "no" | null;
          how_heard?: string | null;
          notice_period?: string | null;
          salary_expectation?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
