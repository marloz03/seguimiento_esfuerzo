// ════════════════════════════════════════════════════════════════════════════
// DICCIONARIO DE NORMALIZACIÓN DE ESTADOS
// ════════════════════════════════════════════════════════════════════════════
//
// Cada tribu en Azure DevOps usa nombres de estado distintos (Doing, Active,
// New, Closed, etc.). El dashboard necesita normalizarlos a 4 CATEGORÍAS para
// que las métricas funcionen igual en todas las tribus:
//
//   Proposed    → no iniciado            (Backlog, New, In Planning...)
//   InProgress  → en curso               (Doing, Active, Testing...)
//   Completed   → terminado              (Done, Closed, Resolved...)
//   Removed     → descartado / eliminado (Removed)
//
// CÓMO AGREGAR UN ESTADO NUEVO:
//   1. El botón "Diagnóstico" del dashboard te dirá qué estados NO están aquí.
//   2. Agrega una línea con el nombre EXACTO del estado y su categoría.
//   3. Opcional: blocked:true si ese estado significa "bloqueado/detenido".
//
// El nombre debe coincidir EXACTAMENTE con el de Azure DevOps (mayúsculas,
// tildes y espacios incluidos).
// ════════════════════════════════════════════════════════════════════════════

window.STATE_MAP = {
  // ── No iniciado ──────────────────────────────────────────────
  'Backlog':          { category: 'Proposed' },
  'New':              { category: 'Proposed' },
  'In Planning':      { category: 'Proposed' },
  'In Plan':          { category: 'Proposed' },
  'Proposed':         { category: 'Proposed' },
  'To Do':            { category: 'Proposed' },

  // ── En curso ─────────────────────────────────────────────────
  'Doing':            { category: 'InProgress' },
  'Entendimiento':    { category: 'InProgress' },
  'Active':           { category: 'InProgress' },
  'Testing':          { category: 'InProgress' },
  'Resolved':         { category: 'InProgress' },
  'Revisión Calidad': { category: 'InProgress' },
  'In Progress':      { category: 'InProgress' },
  'Committed':        { category: 'InProgress' },
  'Bloqueado':        { category: 'InProgress', blocked: true },
  'Blocked':          { category: 'InProgress', blocked: true },

  // ── Terminado ────────────────────────────────────────────────
  'Done':             { category: 'Completed' },
  'Closed':           { category: 'Completed' },
  'Completed':        { category: 'Completed' },

  // ── Descartado ───────────────────────────────────────────────
  'Removed':          { category: 'Removed' },
};
