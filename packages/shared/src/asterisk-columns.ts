/**
 * Columnas del esquema Realtime de Asterisk (contrib/ast-db-manage, rama 20) que el servicio
 * acepta en el apartado "avanzado". Se usan para validar y para autocompletar en la UI.
 */
export const PS_ENDPOINT_COLUMNS = [
  'transport', 'aors', 'auth', 'context', 'disallow', 'allow', 'direct_media', 'connected_line_method',
  'direct_media_method', 'direct_media_glare_mitigation', 'disable_direct_media_on_nat', 'dtmf_mode',
  'external_media_address', 'force_rport', 'ice_support', 'identify_by', 'mailboxes', 'moh_suggest',
  'outbound_auth', 'outbound_proxy', 'rewrite_contact', 'rtp_ipv6', 'rtp_symmetric', 'send_diversion',
  'send_pai', 'send_rpid', 'timers_min_se', 'timers', 'timers_sess_expires', 'callerid', 'callerid_privacy',
  'callerid_tag', '100rel', 'aggregate_mwi', 'trust_id_inbound', 'trust_id_outbound', 'use_ptime', 'use_avpf',
  'media_encryption', 'inband_progress', 'call_group', 'pickup_group', 'named_call_group', 'named_pickup_group',
  'device_state_busy_at', 'fax_detect', 't38_udptl', 't38_udptl_ec', 't38_udptl_maxdatagram', 't38_udptl_nat',
  't38_udptl_ipv6', 'tone_zone', 'language', 'one_touch_recording', 'record_on_feature', 'record_off_feature',
  'rtp_engine', 'allow_transfer', 'allow_subscribe', 'sdp_owner', 'sdp_session', 'tos_audio', 'tos_video',
  'sub_min_expiry', 'from_domain', 'from_user', 'voicemail_extension', 'mwi_from_user', 'dtls_verify',
  'dtls_rekey', 'dtls_cert_file', 'dtls_private_key', 'dtls_cipher', 'dtls_ca_file', 'dtls_ca_path', 'dtls_setup',
  'srtp_tag_32', 'media_address', 'redirect_method', 'set_var', 'cos_audio', 'cos_video', 'message_context',
  'force_avp', 'media_use_received_transport', 'accountcode', 'user_eq_phone', 'moh_passthrough',
  'media_encryption_optimistic', 'rpid_immediate', 'g726_non_standard', 'rtp_keepalive', 'rtp_timeout',
  'rtp_timeout_hold', 'bind_rtp_to_media_address', 'mwi_subscribe_replaces_unsolicited', 'deny', 'permit', 'acl',
  'contact_deny', 'contact_permit', 'contact_acl', 'subscribe_context', 'fax_detect_timeout', 'contact_user',
  'preferred_codec_only', 'asymmetric_rtp_codec', 'rtcp_mux', 'allow_overlap', 'refer_blind_progress',
  'notify_early_inuse_ringing', 'max_audio_streams', 'max_video_streams', 'webrtc', 'dtls_fingerprint',
  'incoming_mwi_mailbox', 'bundle', 'dtls_auto_generate_cert', 'follow_early_media_fork',
  'accept_multiple_sdp_answers', 'suppress_q850_reason_headers', 'trust_connected_line', 'send_connected_line',
  'ignore_183_without_sdp', 'codec_prefs_incoming_offer', 'codec_prefs_outgoing_offer',
  'codec_prefs_incoming_answer', 'codec_prefs_outgoing_answer', 'stir_shaken', 'send_history_info',
  'allow_unauthenticated_options', 'geoloc_incoming_call_profile', 'geoloc_outgoing_call_profile',
  'incoming_call_offer_pref', 'outgoing_call_offer_pref', 'stir_shaken_profile', 'security_negotiation',
  'security_mechanisms', 'send_aoc', 'overlap_context',
] as const;

export const PS_AOR_COLUMNS = [
  'contact', 'default_expiration', 'mailboxes', 'max_contacts', 'minimum_expiration', 'remove_existing',
  'qualify_frequency', 'authenticate_qualify', 'maximum_expiration', 'outbound_proxy', 'support_path',
  'qualify_timeout', 'voicemail_extension', 'remove_unavailable',
] as const;

export const PS_AUTH_COLUMNS = [
  'auth_type', 'nonce_lifetime', 'md5_cred', 'password', 'realm', 'username', 'refresh_token',
  'oauth_clientid', 'oauth_secret',
] as const;

export const PS_REGISTRATION_COLUMNS = [
  'auth_rejection_permanent', 'client_uri', 'contact_user', 'expiration', 'max_retries', 'outbound_auth',
  'outbound_proxy', 'retry_interval', 'forbidden_retry_interval', 'server_uri', 'transport', 'support_path',
  'fatal_retry_interval', 'line', 'endpoint', 'support_outbound', 'contact_header_params',
  'max_random_initial_delay', 'user_agent', 'security_negotiation', 'security_mechanisms',
] as const;

export const PS_IDENTIFY_COLUMNS = ['endpoint', 'match', 'srv_lookups', 'match_header', 'match_request_uri'] as const;

export const QUEUE_COLUMNS = [
  'musiconhold', 'announce', 'context', 'timeout', 'ringinuse', 'setinterfacevar', 'setqueuevar',
  'setqueueentryvar', 'monitor_format', 'membermacro', 'membergosub', 'queue_youarenext', 'queue_thereare',
  'queue_callswaiting', 'queue_quantity1', 'queue_quantity2', 'queue_holdtime', 'queue_minutes', 'queue_minute',
  'queue_seconds', 'queue_thankyou', 'queue_callerannounce', 'queue_reporthold', 'announce_frequency',
  'announce_to_first_user', 'min_announce_frequency', 'announce_round_seconds', 'announce_holdtime',
  'announce_position', 'announce_position_limit', 'periodic_announce', 'periodic_announce_frequency',
  'relative_periodic_announce', 'random_periodic_announce', 'retry', 'wrapuptime', 'penaltymemberslimit',
  'autofill', 'monitor_type', 'autopause', 'autopausedelay', 'autopausebusy', 'autopauseunavail', 'maxlen',
  'servicelevel', 'strategy', 'joinempty', 'leavewhenempty', 'reportholdtime', 'memberdelay', 'weight',
  'timeoutrestart', 'defaultrule', 'timeoutpriority',
] as const;

export const CODECS = [
  'ulaw', 'alaw', 'g722', 'g729', 'gsm', 'opus', 'g726', 'ilbc', 'speex', 'h264', 'vp8', 'vp9',
] as const;

export const DTMF_MODES = ['rfc4733', 'inband', 'info', 'auto', 'auto_info'] as const;

export const QUEUE_STRATEGIES = [
  'ringall', 'leastrecent', 'fewestcalls', 'random', 'rrmemory', 'linear', 'wrandom', 'rrordered',
] as const;
