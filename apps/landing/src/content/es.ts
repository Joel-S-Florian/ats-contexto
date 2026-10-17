// Todo el texto de la landing vive aquí (español de República Dominicana, tono cercano y profesional).
// Separado del diseño para editarlo sin tocar componentes y para facilitar i18n más adelante.
// Los planes y precios NO están aquí: salen de @ats/shared (única fuente, la misma que usa el panel).

export const brand = {
  // Nombre provisional del producto: cámbialo aquí cuando se defina.
  name: "Plataforma de Reclutamiento",
  short: "Reclutamiento",
  legalEntity: "[Razón social pendiente de definir]",
  contactEmail: "hola@ejemplo.com",
};

export const nav = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#confianza", label: "Confianza" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas" },
];

export const hero = {
  eyebrow: "ATS para empresas dominicanas",
  title: "Contrata mejor, con decisiones que puedes explicar.",
  subtitle:
    "Recibe postulaciones en tu propia página de empleo, deja que el sistema preseleccione y dedica el tiempo de tu equipo a los mejores candidatos. Cada puntaje trae su justificación y siempre decide una persona.",
  cta: "Solicitar demo",
  secondary: "Ver cómo funciona",
  proof: [
    "Sin instalar nada: un script en tu página",
    "IA opcional, con justificación",
    "Nada se descarta en silencio",
  ],
};

export const problem = {
  title: "Recibir cientos de CV no debería costarte semanas",
  subtitle:
    "Reclutar bien es un trabajo de criterio. El resto, repetirlo a mano, es lo que te frena.",
  items: [
    {
      icon: "clock",
      title: "Horas filtrando a mano",
      text: "Abrir CV uno por uno para descubrir que la mayoría no cumple lo básico.",
    },
    {
      icon: "scale",
      title: "Decisiones difíciles de justificar",
      text: "Sin criterios claros es complicado explicar por qué una persona avanzó y otra no.",
    },
    {
      icon: "inbox",
      title: "Candidatos perdidos entre correos",
      text: "Hojas de cálculo, hilos de correo y chats: nadie sabe en qué etapa va cada quien.",
    },
  ],
};

export const how = {
  title: "Del formulario en tu página al candidato contratado",
  subtitle: "Un solo flujo, configurable por vacante, con una persona al mando en cada paso.",
  steps: [
    {
      icon: "briefcase",
      title: "Publicas la vacante",
      text: "Define el perfil, las skills y los filtros eliminatorios. Elige o ajusta el embudo.",
    },
    {
      icon: "globe",
      title: "Se postulan desde tu página",
      text: "El widget vive dentro de tu sitio, con tu estilo. El candidato no sale de tu página ni crea cuenta.",
    },
    {
      icon: "sparkles",
      title: "Preselección con justificación",
      text: "El sistema puntúa y explica cada dimensión. Quien no cumple un filtro queda visible y se puede revertir.",
    },
    {
      icon: "calendar",
      title: "Entrevistas y agenda",
      text: "Invitaciones por correo con calendario, enlaces de reunión y plantillas editables.",
    },
    {
      icon: "clipboard",
      title: "Evaluación",
      text: "Exámenes generalistas con enlace personal y tiempo controlado, o el registro de tus pruebas propias.",
    },
    {
      icon: "handshake",
      title: "Selección y contratación",
      text: "Decides tú. Al confirmar, el contratado recibe su correo y tu nómina recibe sus datos.",
    },
  ],
};

export const features = {
  title: "Todo el proceso, en un solo lugar",
  subtitle: "Sin cambiar de herramienta entre captar, evaluar y contratar.",
  items: [
    {
      icon: "globe",
      title: "Widget para tu página de empleo",
      text: "Listado de vacantes con buscador y filtros, formulario de postulación y bolsa de talento. Aislado de los estilos de tu sitio.",
    },
    {
      icon: "sparkles",
      title: "Preselección automática, explicada",
      text: "Reglas determinísticas en el plan base y análisis con IA en los planes superiores. Siempre con evidencia y motivos.",
    },
    {
      icon: "calendar",
      title: "Entrevistas, agenda y correos",
      text: "Agenda con calendario, plantillas por etapa y registro de llamadas y mensajes.",
    },
    {
      icon: "clipboard",
      title: "Evaluaciones",
      text: "Exámenes con puntaje automático en preguntas cerradas y revisión manual en las abiertas.",
    },
    {
      icon: "users",
      title: "Selección y contratación",
      text: "Comentarios de los evaluadores, decisión humana por defecto y confirmación explícita al contratar.",
    },
    {
      icon: "plug",
      title: "API de contratados",
      text: "Webhook firmado y exportación en JSON y CSV para entregar al contratado a tu nómina o sistema de RRHH.",
    },
  ],
};

export const trust = {
  title: "La IA explica; las personas deciden",
  subtitle: "Automatizamos lo repetitivo sin esconder ni imponer decisiones.",
  items: [
    {
      icon: "file-search",
      title: "Cada puntaje, con su porqué",
      text: "Dimensiones, justificaciones y evidencia tomada del CV. Nada de cajas negras.",
    },
    {
      icon: "undo",
      title: "Nada se descarta en silencio",
      text: "Todo descarte es visible, con motivo, y tu equipo puede revertirlo en cualquier momento.",
    },
    {
      icon: "user-check",
      title: "Siempre interviene una persona",
      text: "La IA nunca contrata ni elimina datos. Si falla, el candidato pasa a revisión manual.",
    },
    {
      icon: "shield",
      title: "Datos de cada empresa, separados",
      text: "Aislamiento por empresa a nivel de base de datos y registro de accesos a los CV.",
    },
    {
      icon: "eye-off",
      title: "CV anonimizado antes de la IA",
      text: "Se retiran nombre, contacto y datos personales antes de enviar el texto a un proveedor de IA.",
    },
    {
      icon: "history",
      title: "Historial de cada cambio",
      text: "Quién movió a quién, cuándo, por qué y si fue automático.",
    },
  ],
};

export const pricing = {
  title: "Planes que crecen contigo",
  subtitle: "Suscripción mensual. El plan Esencial no usa IA y sigue preseleccionando con reglas.",
  note: "Precios de referencia en dólares; el cobro se hace en pesos dominicanos (DOP). Consulta por pago anual y por un plan corporativo a medida.",
  popular: "professional" as const,
  cta: "Solicitar demo",
};

export const faq = {
  title: "Preguntas frecuentes",
  items: [
    {
      q: "¿Necesito instalar algo?",
      a: "No. Agregas un fragmento de código a tu página de empleo y el widget aparece con tus vacantes. Tu equipo trabaja desde el panel en el navegador.",
    },
    {
      q: "¿La IA decide a quién contratan?",
      a: "No. La IA puntúa y explica; nunca contrata ni elimina datos. La decisión final es siempre de una persona, y tú puedes mover a cualquier candidato a cualquier etapa.",
    },
    {
      q: "¿Puedo usarlo sin IA?",
      a: "Sí. El plan Esencial preselecciona con reglas determinísticas sobre los datos del formulario (skills, experiencia, formación, ubicación, idiomas) y explica el resultado.",
    },
    {
      q: "¿Qué pasa con los datos de los candidatos?",
      a: "Se tratan con un aviso claro y su consentimiento. Se conservan por el plazo que definas (12 meses por defecto), puedes exportar o eliminar los datos de una persona y los CV se anonimizan antes de cualquier análisis con IA.",
    },
    {
      q: "¿Cómo se conecta con nuestra nómina?",
      a: "Al confirmar una contratación se envía un webhook firmado con los datos del contratado a tu sistema, y también puedes exportar en JSON o CSV.",
    },
    {
      q: "¿Cuánto tardamos en empezar?",
      a: "Después de la demo creamos tu empresa y tus usuarios. Con tus vacantes cargadas y el widget en tu página, puedes recibir postulaciones el mismo día.",
    },
    {
      q: "¿Puedo cambiar de plan?",
      a: "Sí. Si te acercas a los límites del mes, el panel te avisa y puedes pasar al plan siguiente sin perder información.",
    },
    {
      q: "¿Cobran en pesos dominicanos?",
      a: "Sí, el cobro se hace en DOP a partir de un precio de referencia en dólares.",
    },
  ],
};

export const demo = {
  title: "Pide una demo",
  subtitle: "Te mostramos el flujo completo con tus propias vacantes de ejemplo. Sin compromiso.",
  points: [
    "Recorrido de 30 minutos",
    "Ejemplo con el widget en vivo",
    "Resolvemos tus dudas de integración",
  ],
  sizes: [
    { value: "1-10", label: "1 a 10 personas" },
    { value: "11-50", label: "11 a 50 personas" },
    { value: "51-200", label: "51 a 200 personas" },
    { value: "201+", label: "Más de 200 personas" },
  ],
  consent: "Acepto la política de privacidad y que me contacten para coordinar la demo.",
  success: "¡Gracias! Recibimos tu solicitud. Te escribiremos pronto para agendar la demo.",
  live: {
    title: "Pruébalo tú mismo",
    text: "Mira el widget funcionando en la página de una empresa ficticia.",
    cta: "Abrir demostración en vivo",
  },
};

export const footer = {
  tagline: "Reclutamiento claro, con personas al mando.",
  links: [
    { href: "/privacidad", label: "Política de privacidad" },
    { href: "/terminos", label: "Términos del servicio" },
  ],
};

export const legal = {
  draftNotice:
    "Borrador sujeto a revisión legal. Este texto no constituye asesoría jurídica y debe ser revisado por un abogado antes de publicarse.",
  privacy: {
    title: "Política de privacidad",
    sections: [
      {
        h: "Quiénes somos",
        p: "Este sitio presenta una plataforma de reclutamiento. El responsable del tratamiento de los datos de contacto que nos envías es [razón social pendiente de definir].",
      },
      {
        h: "Qué datos recopilamos",
        p: "Cuando solicitas una demo recopilamos tu nombre, empresa, correo, teléfono (opcional), tamaño de la empresa y el mensaje que escribas. También guardamos una versión truncada de tu dirección IP para prevenir abuso.",
      },
      {
        h: "Para qué los usamos",
        p: "Únicamente para responder tu solicitud, coordinar la demo y mantener la relación comercial. No vendemos tus datos.",
      },
      {
        h: "Cuánto tiempo los conservamos",
        p: "Mientras dure la relación comercial o hasta que solicites su eliminación.",
      },
      {
        h: "Tus derechos",
        p: "Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a [correo de contacto pendiente de definir].",
      },
      {
        h: "Datos de candidatos",
        p: "Los datos de las personas que se postulan a vacantes de nuestros clientes los trata cada empresa cliente como responsable; nosotros los procesamos en su nombre bajo sus instrucciones.",
      },
    ],
  },
  terms: {
    title: "Términos del servicio",
    sections: [
      {
        h: "Objeto",
        p: "Estos términos regulan el uso de la plataforma de reclutamiento y de este sitio informativo.",
      },
      {
        h: "Cuentas",
        p: "Las empresas clientes reciben acceso tras la demo y la contratación de un plan. No hay registro automático ni pago en línea en este sitio.",
      },
      {
        h: "Uso aceptable",
        p: "No se permite usar la plataforma para discriminar a personas por atributos protegidos, ni para cargar contenido ilícito o dañino.",
      },
      {
        h: "Inteligencia artificial",
        p: "Las recomendaciones automáticas son una ayuda a la decisión. La empresa cliente es responsable de las decisiones de contratación.",
      },
      {
        h: "Planes y pagos",
        p: "Los planes, límites y precios vigentes se publican en este sitio y pueden cambiar con aviso previo. El cobro se realiza en pesos dominicanos.",
      },
      {
        h: "Responsabilidad",
        p: "[Cláusulas de limitación de responsabilidad, soporte y disponibilidad pendientes de redacción legal.]",
      },
    ],
  },
};
