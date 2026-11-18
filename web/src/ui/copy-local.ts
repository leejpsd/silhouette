// Copy this app needs that shared/copy does not have yet. Looked up after shared/copy and the pack
// copy, so once shared/copy has a key, its text is used and the entry here can be removed.
// Since the "Brand & UI" design: the rail, the where-it-ran badge without a model, and the keyboard hints.

const EN = {
  'rail.steps': 'Steps',
  'rail.quickCheck': 'Quick Check',
  'rail.results': 'Results',
  'rail.done': 'Done',
  'rail.current': 'current step',
  'rail.judges': 'For judges',
  'badge.noModel': 'No model',
  'keys.continue': 'to continue',
  'keys.keep': 'keeps it on this device. Nothing is sent until you press Send.',
  'keys.label': 'Keyboard: {keys}',
  'record.exactlySent': 'Exactly what was sent',
  'record.pick': 'Choose a request in the list to see exactly what it carried.',
} as const;

export type LocalKey = keyof typeof EN;

export const LOCAL_COPY: Readonly<Record<'en' | 'es' | 'ko', Readonly<Partial<Record<LocalKey, string>>>>> = {
  en: EN,
  es: {
    'rail.steps': 'Pasos',
    'rail.quickCheck': 'Revisión rápida',
    'rail.results': 'Resultados',
    'rail.done': 'Hecho',
    'rail.current': 'paso actual',
    'rail.judges': 'Para el jurado',
    'badge.noModel': 'Sin modelo',
    'keys.continue': 'para continuar',
    'keys.keep': 'lo deja en este dispositivo. No se envía nada hasta que pulses Enviar.',
    'keys.label': 'Teclado: {keys}',
    'record.exactlySent': 'Exactamente lo que se envió',
    'record.pick': 'Elige una solicitud de la lista para ver exactamente lo que llevaba.',
  },
  // Korean holds the English text (shared/copy convention).
  ko: EN,
};
