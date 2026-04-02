/* ============================================================
   TASKFLOW PRO — DATA.JS
   Dados simulados para demonstração
============================================================ */
'use strict';

(function () {
  const today = new Date();
  function iso(offsetDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  window.SEED_DATA = {
    activities: [
      /* ── PROJETO ALPHA ── */
      { id: 's01', project: 'Projeto Alpha', team: 'Equipe 01', description: 'Levantamento de requisitos', responsible: 'Carlos Lima', startDate: iso(-30), dueDate: iso(-20), status: 'Concluído', isCritical: false, predecessorId: null, depType: 'FS', weight: 2, obs: '' },
      { id: 's02', project: 'Projeto Alpha', team: 'Equipe 01', description: 'Projeto executivo estrutural', responsible: 'Ana Paula', startDate: iso(-20), dueDate: iso(-8), status: 'Vencido', isCritical: true, predecessorId: 's01', depType: 'FS', weight: 3, obs: 'Bloqueado por revisão' },
      { id: 's03', project: 'Projeto Alpha', team: 'Equipe 01', description: 'Aquisição de materiais críticos', responsible: 'Pedro Souza', startDate: iso(-10), dueDate: iso(-3), status: 'Vencido', isCritical: true, predecessorId: 's02', depType: 'FS', weight: 3, obs: '' },
      { id: 's04', project: 'Projeto Alpha', team: 'Equipe 02', description: 'Mobilização de equipe de campo', responsible: 'Rafaela Cruz', startDate: iso(-5), dueDate: iso(0), status: 'Pendente', isCritical: true, predecessorId: 's03', depType: 'FS', weight: 3, obs: '' },
      { id: 's05', project: 'Projeto Alpha', team: 'Equipe 02', description: 'Montagem de estrutura metálica', responsible: 'Marcos Dias', startDate: iso(0), dueDate: iso(12), status: 'Pendente', isCritical: true, predecessorId: 's04', depType: 'FS', weight: 3, obs: '' },
      { id: 's06', project: 'Projeto Alpha', team: 'Equipe 02', description: 'Instalação elétrica primária', responsible: 'Carlos Lima', startDate: iso(10), dueDate: iso(22), status: 'Pendente', isCritical: false, predecessorId: 's05', depType: 'FS', weight: 2, obs: '' },
      { id: 's07', project: 'Projeto Alpha', team: 'Equipe 03', description: 'Comissionamento do sistema', responsible: 'Ana Paula', startDate: iso(20), dueDate: iso(35), status: 'Pendente', isCritical: false, predecessorId: 's06', depType: 'FS', weight: 2, obs: '' },
      { id: 's08', project: 'Projeto Alpha', team: 'Equipe 03', description: 'Documentação técnica final', responsible: 'Rafaela Cruz', startDate: iso(33), dueDate: iso(45), status: 'Pendente', isCritical: false, predecessorId: null, depType: 'FS', weight: 1, obs: '' },

      /* ── PROJETO BETA ── */
      { id: 's09', project: 'Projeto Beta', team: 'Equipe 02', description: 'Diagnóstico de campo', responsible: 'Diego Mendes', startDate: iso(-25), dueDate: iso(-15), status: 'Concluído', isCritical: false, predecessorId: null, depType: 'FS', weight: 2, obs: '' },
      { id: 's10', project: 'Projeto Beta', team: 'Equipe 02', description: 'Contratação de fornecedores', responsible: 'Luciana Torres', startDate: iso(-15), dueDate: iso(-5), status: 'Vencido', isCritical: true, predecessorId: 's09', depType: 'FS', weight: 3, obs: 'Processo licitatório atrasado' },
      { id: 's11', project: 'Projeto Beta', team: 'Equipe 03', description: 'Fabricação de peças sob medida', responsible: 'Fábio Ramos', startDate: iso(-8), dueDate: iso(5), status: 'Pendente', isCritical: true, predecessorId: 's10', depType: 'FS', weight: 3, obs: '' },
      { id: 's12', project: 'Projeto Beta', team: 'Equipe 03', description: 'Testes de aceitação em fábrica', responsible: 'Diego Mendes', startDate: iso(3), dueDate: iso(15), status: 'Pendente', isCritical: false, predecessorId: 's11', depType: 'FS', weight: 2, obs: '' },
      { id: 's13', project: 'Projeto Beta', team: 'Equipe 01', description: 'Transporte e logística', responsible: 'Luciana Torres', startDate: iso(13), dueDate: iso(20), status: 'Pendente', isCritical: false, predecessorId: 's12', depType: 'FS', weight: 2, obs: '' },
      { id: 's14', project: 'Projeto Beta', team: 'Equipe 01', description: 'Instalação e start-up', responsible: 'Fábio Ramos', startDate: iso(18), dueDate: iso(30), status: 'Pendente', isCritical: true, predecessorId: 's13', depType: 'FS', weight: 3, obs: '' },

      /* ── PROJETO GAMMA ── */
      { id: 's15', project: 'Projeto Gamma', team: 'Equipe 03', description: 'Inspeção e auditoria inicial', responsible: 'Sandra Melo', startDate: iso(-40), dueDate: iso(-30), status: 'Concluído', isCritical: false, predecessorId: null, depType: 'FS', weight: 1, obs: '' },
      { id: 's16', project: 'Projeto Gamma', team: 'Equipe 01', description: 'Plano de manutenção preventiva', responsible: 'Tiago Ferreira', startDate: iso(-30), dueDate: iso(-18), status: 'Concluído', isCritical: false, predecessorId: 's15', depType: 'FS', weight: 2, obs: '' },
      { id: 's17', project: 'Projeto Gamma', team: 'Equipe 01', description: 'Treinamento de equipe técnica', responsible: 'Sandra Melo', startDate: iso(-20), dueDate: iso(-10), status: 'Vencido', isCritical: false, predecessorId: 's16', depType: 'FS', weight: 2, obs: '' },
      { id: 's18', project: 'Projeto Gamma', team: 'Equipe 02', description: 'Execução de manutenção preventiva', responsible: 'Tiago Ferreira', startDate: iso(-5), dueDate: iso(0), status: 'Pendente', isCritical: true, predecessorId: 's17', depType: 'FS', weight: 3, obs: '' },
      { id: 's19', project: 'Projeto Gamma', team: 'Equipe 02', description: 'Substituição de componentes críticos', responsible: 'Sandra Melo', startDate: iso(0), dueDate: iso(8), status: 'Pendente', isCritical: true, predecessorId: 's18', depType: 'FS', weight: 3, obs: '' },
      { id: 's20', project: 'Projeto Gamma', team: 'Equipe 03', description: 'Relatório final de manutenção', responsible: 'Tiago Ferreira', startDate: iso(6), dueDate: iso(18), status: 'Pendente', isCritical: false, predecessorId: 's19', depType: 'FS', weight: 1, obs: '' },

      /* ── PROJETO DELTA (tarefas futuras) ── */
      { id: 's21', project: 'Projeto Delta', team: 'Equipe 01', description: 'Escopo e cronograma base', responsible: 'Ana Paula', startDate: iso(5), dueDate: iso(15), status: 'Pendente', isCritical: false, predecessorId: null, depType: 'FS', weight: 2, obs: '' },
      { id: 's22', project: 'Projeto Delta', team: 'Equipe 02', description: 'Orçamento e aprovação', responsible: 'Carlos Lima', startDate: iso(12), dueDate: iso(25), status: 'Pendente', isCritical: false, predecessorId: 's21', depType: 'FS', weight: 2, obs: '' },
      { id: 's23', project: 'Projeto Delta', team: 'Equipe 03', description: 'Kickoff com stakeholders', responsible: 'Marcos Dias', startDate: iso(20), dueDate: iso(30), status: 'Pendente', isCritical: false, predecessorId: 's22', depType: 'FS', weight: 1, obs: '' },
    ],

    projects: [
      { id: 'p01', name: 'Projeto Alpha', code: 'ALPHA-001', description: 'Instalação de sistema elétrico industrial', manager: 'Carlos Lima', status: 'Em andamento', startDate: iso(-30), endDate: iso(50), duration: 480, progress: 35, color: '#3b82f6' },
      { id: 'p02', name: 'Projeto Beta',  code: 'BETA-002',  description: 'Fornecimento e instalação de equipamentos', manager: 'Diego Mendes', status: 'Em andamento', startDate: iso(-25), endDate: iso(35), duration: 320, progress: 28, color: '#f59e0b' },
      { id: 'p03', name: 'Projeto Gamma', code: 'GAMA-003',  description: 'Manutenção preventiva de linha de produção', manager: 'Sandra Melo', status: 'Em andamento', startDate: iso(-40), endDate: iso(25), duration: 200, progress: 55, color: '#10b981' },
      { id: 'p04', name: 'Projeto Delta', code: 'DELTA-004', description: 'Modernização do sistema de controle', manager: 'Ana Paula', status: 'Novas', startDate: iso(5), endDate: iso(90), duration: 600, progress: 0, color: '#8b5cf6' },
    ],

    collaborators: [
      { id: 'c01', name: 'Carlos Lima',    role: 'Engenheiro Elétrico',    team: 'Equipe 01', capacity: 8, costHour: 95,  color: '#3b82f6' },
      { id: 'c02', name: 'Ana Paula',      role: 'Engenheira Civil',        team: 'Equipe 01', capacity: 8, costHour: 110, color: '#6366f1' },
      { id: 'c03', name: 'Pedro Souza',    role: 'Técnico de Suprimentos',  team: 'Equipe 01', capacity: 8, costHour: 65,  color: '#0ea5e9' },
      { id: 'c04', name: 'Rafaela Cruz',   role: 'Supervisora de Campo',    team: 'Equipe 02', capacity: 8, costHour: 85,  color: '#f59e0b' },
      { id: 'c05', name: 'Marcos Dias',    role: 'Soldador Especialista',   team: 'Equipe 02', capacity: 8, costHour: 75,  color: '#f97316' },
      { id: 'c06', name: 'Diego Mendes',   role: 'Gerente de Projeto',      team: 'Equipe 02', capacity: 8, costHour: 130, color: '#ef4444' },
      { id: 'c07', name: 'Luciana Torres', role: 'Analista de Suprimentos', team: 'Equipe 02', capacity: 8, costHour: 70,  color: '#ec4899' },
      { id: 'c08', name: 'Fábio Ramos',    role: 'Mecânico Industrial',     team: 'Equipe 03', capacity: 8, costHour: 80,  color: '#10b981' },
      { id: 'c09', name: 'Sandra Melo',    role: 'Inspetora de Qualidade',  team: 'Equipe 03', capacity: 8, costHour: 90,  color: '#14b8a6' },
      { id: 'c10', name: 'Tiago Ferreira', role: 'Técnico de Manutenção',   team: 'Equipe 03', capacity: 8, costHour: 72,  color: '#84cc16' },
    ]
  };
})();
