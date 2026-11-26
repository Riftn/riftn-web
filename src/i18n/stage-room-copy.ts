import i18n, { type TFunction } from 'i18next';

const STAGE_ROOM_COPY = {
  "en": {
    "entrySettings": "Room settings",
    "entryPending": "Request sent. Try joining again once the host approves you.",
    "entrySignIn": "Sign in to request entry",
    "entryUnavailable": "Room settings are unavailable. Try again.",
    "entryHelp": "Locking requires host approval for new listeners. People already connected can stay. Recordings are still public.",
    "lockEntry": "Lock entry",
    "unlockEntry": "Unlock entry",
    "noEntryRequests": "No pending requests",
    "approveEntry": "Approve",
    "editRoomTitle": "Room title",
    "roomTopic": "Topic",
    "topicNone": "No topic",
    "topicAll": "All topics",
    "searchRooms": "Search live rooms",
    "noMatchingRooms": "No live rooms match your filters.",
    "entryLocked": "Locked",
    "returnToStage": "Return",
    "liveRadio": "Live radio",
    "stageHeadcount_one": "{{count}} participant",
    "stageHeadcount_other": "{{count}} participants",
    "join": "Join",
    "topics": {
      "general": "General",
      "crypto": "Crypto",
      "sports": "Sports",
      "gaming": "Gaming",
      "technology": "Technology"
    }
  },
  "tr": {
    "entrySettings": "Oda ayarları",
    "entryPending": "İstek gönderildi. Oda sahibi onayladığında tekrar katılmayı dene.",
    "entrySignIn": "Giriş isteği göndermek için oturum aç",
    "entryUnavailable": "Oda ayarlarına erişilemiyor. Tekrar dene.",
    "entryHelp": "Kilitli odaya yeni dinleyiciler ancak oda sahibinin onayıyla katılabilir. Bağlı olanlar kalabilir. Kayıtlar herkese açık kalır.",
    "lockEntry": "Girişi kilitle",
    "unlockEntry": "Giriş kilidini aç",
    "noEntryRequests": "Bekleyen istek yok",
    "approveEntry": "Onayla",
    "editRoomTitle": "Oda başlığı",
    "roomTopic": "Konu",
    "topicNone": "Konu yok",
    "topicAll": "Tüm konular",
    "searchRooms": "Canlı odaları ara",
    "noMatchingRooms": "Filtrelerine uyan canlı oda yok.",
    "entryLocked": "Kilitli",
    "returnToStage": "Dön",
    "liveRadio": "Canlı radyo",
    "stageHeadcount_one": "{{count}} katılımcı",
    "stageHeadcount_other": "{{count}} katılımcı",
    "join": "Katıl",
    "topics": {
      "general": "Genel",
      "crypto": "Kripto",
      "sports": "Spor",
      "gaming": "Oyun",
      "technology": "Teknoloji"
    }
  },
  "ar": {
    "entrySettings": "إعدادات الغرفة",
    "entryPending": "أُرسل طلبك. حاول الانضمام بعد موافقة المضيف.",
    "entrySignIn": "سجّل الدخول لطلب الانضمام",
    "entryUnavailable": "إعدادات الغرفة غير متاحة. حاول مجددًا.",
    "entryHelp": "يتطلب القفل موافقة المضيف على المستمعين الجدد. يمكن للمتصلين حاليًا البقاء. تظل التسجيلات عامة.",
    "lockEntry": "قفل الانضمام",
    "unlockEntry": "إلغاء قفل الانضمام",
    "noEntryRequests": "لا توجد طلبات معلّقة",
    "approveEntry": "موافقة",
    "editRoomTitle": "عنوان الغرفة",
    "roomTopic": "الموضوع",
    "topicNone": "بلا موضوع",
    "topicAll": "جميع المواضيع",
    "searchRooms": "ابحث في الغرف المباشرة",
    "noMatchingRooms": "لا توجد غرف مباشرة تطابق عوامل التصفية.",
    "entryLocked": "مغلقة",
    "returnToStage": "عودة",
    "liveRadio": "راديو مباشر",
    "stageHeadcount_zero": "{{count}} مشارك",
    "stageHeadcount_one": "{{count}} مشارك",
    "stageHeadcount_two": "{{count}} مشاركان",
    "stageHeadcount_few": "{{count}} مشاركين",
    "stageHeadcount_many": "{{count}} مشاركًا",
    "stageHeadcount_other": "{{count}} مشارك",
    "join": "انضمام",
    "topics": {
      "general": "عام",
      "crypto": "العملات الرقمية",
      "sports": "الرياضة",
      "gaming": "الألعاب",
      "technology": "التقنية"
    }
  },
  "es": {
    "entrySettings": "Ajustes de la sala",
    "entryPending": "Solicitud enviada. Intenta unirte de nuevo cuando el anfitrión la apruebe.",
    "entrySignIn": "Inicia sesión para solicitar el acceso",
    "entryUnavailable": "Los ajustes de la sala no están disponibles. Inténtalo de nuevo.",
    "entryHelp": "Al bloquear la entrada, el anfitrión debe aprobar a los nuevos oyentes. Quienes ya están conectados pueden quedarse. Las grabaciones siguen siendo públicas.",
    "lockEntry": "Bloquear entrada",
    "unlockEntry": "Desbloquear entrada",
    "noEntryRequests": "No hay solicitudes pendientes",
    "approveEntry": "Aprobar",
    "editRoomTitle": "Título de la sala",
    "roomTopic": "Tema",
    "topicNone": "Sin tema",
    "topicAll": "Todos los temas",
    "searchRooms": "Buscar salas en directo",
    "noMatchingRooms": "No hay salas en directo que coincidan con tus filtros.",
    "entryLocked": "Bloqueada",
    "returnToStage": "Volver",
    "liveRadio": "Radio en directo",
    "stageHeadcount_one": "{{count}} participante",
    "stageHeadcount_other": "{{count}} participantes",
    "join": "Unirse",
    "topics": {
      "general": "General",
      "crypto": "Cripto",
      "sports": "Deportes",
      "gaming": "Videojuegos",
      "technology": "Tecnología"
    }
  },
  "fr": {
    "entrySettings": "Paramètres du salon",
    "entryPending": "Demande envoyée. Réessayez de rejoindre le salon après l’accord de l’hôte.",
    "entrySignIn": "Connectez-vous pour demander l’accès",
    "entryUnavailable": "Les paramètres du salon sont indisponibles. Réessayez.",
    "entryHelp": "Le verrouillage exige l’accord de l’hôte pour les nouveaux auditeurs. Les personnes déjà connectées peuvent rester. Les enregistrements restent publics.",
    "lockEntry": "Verrouiller l’accès",
    "unlockEntry": "Déverrouiller l’accès",
    "noEntryRequests": "Aucune demande en attente",
    "approveEntry": "Approuver",
    "editRoomTitle": "Nom du salon",
    "roomTopic": "Sujet",
    "topicNone": "Sans sujet",
    "topicAll": "Tous les sujets",
    "searchRooms": "Rechercher des salons en direct",
    "noMatchingRooms": "Aucun salon en direct ne correspond à vos filtres.",
    "entryLocked": "Verrouillé",
    "returnToStage": "Revenir",
    "liveRadio": "Radio en direct",
    "stageHeadcount_one": "{{count}} participant",
    "stageHeadcount_other": "{{count}} participants",
    "join": "Rejoindre",
    "topics": {
      "general": "Général",
      "crypto": "Crypto",
      "sports": "Sports",
      "gaming": "Jeux vidéo",
      "technology": "Technologie"
    }
  },
  "nl": {
    "entrySettings": "Kamerinstellingen",
    "entryPending": "Verzoek verstuurd. Probeer opnieuw deel te nemen zodra de host je heeft goedgekeurd.",
    "entrySignIn": "Log in om toegang aan te vragen",
    "entryUnavailable": "De kamerinstellingen zijn niet beschikbaar. Probeer het opnieuw.",
    "entryHelp": "Als de toegang is vergrendeld, moet de host nieuwe luisteraars goedkeuren. Wie al verbonden is, kan blijven. Opnamen blijven openbaar.",
    "lockEntry": "Toegang vergrendelen",
    "unlockEntry": "Toegang ontgrendelen",
    "noEntryRequests": "Geen openstaande verzoeken",
    "approveEntry": "Goedkeuren",
    "editRoomTitle": "Kamertitel",
    "roomTopic": "Onderwerp",
    "topicNone": "Geen onderwerp",
    "topicAll": "Alle onderwerpen",
    "searchRooms": "Livekamers zoeken",
    "noMatchingRooms": "Er zijn geen livekamers die aan je filters voldoen.",
    "entryLocked": "Vergrendeld",
    "returnToStage": "Terug",
    "liveRadio": "Live radio",
    "stageHeadcount_one": "{{count}} deelnemer",
    "stageHeadcount_other": "{{count}} deelnemers",
    "join": "Deelnemen",
    "topics": {
      "general": "Algemeen",
      "crypto": "Crypto",
      "sports": "Sport",
      "gaming": "Gaming",
      "technology": "Technologie"
    }
  }
};

type CopyLocale = keyof typeof STAGE_ROOM_COPY;
type StageRoomLabel = Exclude<keyof typeof STAGE_ROOM_COPY.en, 'topics' | 'stageHeadcount_one' | 'stageHeadcount_other'>;

function stageRoomLocale(): CopyLocale {
  const code = i18n.language?.split(/[-_]/)[0]?.toLowerCase() ?? 'en';
  return Object.prototype.hasOwnProperty.call(STAGE_ROOM_COPY, code) ? code as CopyLocale : 'en';
}

export function stageRoomLabel(t: TFunction, key: StageRoomLabel) {
  return t(`stageRooms.${key}`, { defaultValue: STAGE_ROOM_COPY[stageRoomLocale()][key] });
}

export function stageTopicLabel(t: TFunction, topic: string) {
  const topics = STAGE_ROOM_COPY[stageRoomLocale()].topics;
  return t(`stageRooms.topics.${topic}`, {
    defaultValue: topics[topic as keyof typeof topics] ?? topic,
  });
}

export function stageHeadcount(t: TFunction, count: number) {
  const locale = stageRoomLocale();
  const copy = STAGE_ROOM_COPY[locale];
  const form = new Intl.PluralRules(locale).select(count);
  const variant = Reflect.get(copy, 'stageHeadcount_' + form);
  return t('stageRooms.stageHeadcount', {
    count,
    defaultValue: typeof variant === 'string' ? variant : copy.stageHeadcount_other,
  });
}
