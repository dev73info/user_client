                                               Table "public.user_realname_verification"
           Column           |           Type           | Collation | Nullable |                        Default                         
----------------------------+--------------------------+-----------+----------+--------------------------------------------------------
 id                         | bigint                   |           | not null | nextval('user_realname_verification_id_seq'::regclass)
 user_id                    | uuid                     |           | not null | 
 auth_type                  | text                     |           | not null | 
 status                     | text                     |           | not null | 'pending'::text
 real_name                  | text                     |           |          | 
 id_card_no                 | text                     |           |          | 
 company_name               | text                     |           |          | 
 unified_social_credit_code | text                     |           |          | 
 business_license_no        | text                     |           |          | 
 operator_name              | text                     |           |          | 
 operator_id_card_no        | text                     |           |          | 
 review_note                | text                     |           |          | 
 reviewed_by                | text                     |           |          | 
 reviewed_at                | timestamp with time zone |           |          | 
 created_at                 | timestamp with time zone |           | not null | timezone('Asia/Shanghai'::text, now())
 updated_at                 | timestamp with time zone |           | not null | timezone('Asia/Shanghai'::text, now())
 guardian_consent           | boolean                  |           |          | 
 guardian_consent_file      | text                     |           |          | 
 id_card_no_hash            | text                     |           |          | 
 mobile                     | text                     |           |          | 
 asign_serial_no            | text                     |           |          | 
Indexes:
    "user_realname_verification_pkey" PRIMARY KEY, btree (id)
    "idx_user_realname_verification_auth_type" btree (auth_type, updated_at DESC, id DESC)
    "idx_user_realname_verification_identity_document_unique" UNIQUE, btree (lower(btrim(id_card_no))) WHERE id_card_no IS NOT NULL AND btrim(id_card_no) <> ''::text
    "idx_user_realname_verification_status" btree (status, updated_at DESC, id DESC)
    "user_realname_verification_user_id_key" UNIQUE CONSTRAINT, btree (user_id)
Check constraints:
    "user_realname_verification_auth_type_check" CHECK (auth_type = ANY (ARRAY['IDENTITY_CARD'::text, 'ENTERPRISE'::text, 'RESIDENCE_HK_MC'::text, 'RESIDENCE_TAIWAN'::text]))
    "user_realname_verification_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
Foreign-key constraints:
    "user_realname_verification_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
Triggers:
    trg_user_realname_verification_updated_at BEFORE UPDATE ON user_realname_verification FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()

