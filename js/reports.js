// ===================================================
// REPORTS.JS – Relatórios e métricas avançadas
// ===================================================

function renderReports() {
  const page   = document.getElementById('pageReports');
  const lots   = STATE.lots;
  const routes = STATE.routes;

  // ── KPIs gerais ──
  const total     = lots.length;
  const inProd    = lots.filter(l => !['pronto','entrega','entregue'].includes(l.sector));
  const delivered = lots.filter(l => l.sector === 'entregue');
  const late      = lots.filter(l => isLate(l));
  const working   = lots.filter(l => l.lotStatus === 'working');
  const paused    = lots.filter(l => l.lotStatus === 'paused');

  const days = Math.max(1, Math.ceil(
    (Date.now() - Math.min(...lots.map(l => l.createdAt || Date.now()))) / 86400000
  ));
  const avgPerDay      = (total / days).toFixed(1);
  const avgDelivPerDay = (delivered.length / days).toFixed(1);

  // ── Distribuição por setor ──
  const sectorDist = SECTORS.map(s => ({
    sector: s,
    count: lots.filter(l => l.history && l.history.some(h => h.sector === s)).length
  }));

  // ── Top clientes ──
  const clientMap = {};
  lots.forEach(l => { clientMap[l.client] = (clientMap[l.client]||0)+1; });
  const topClients = Object.entries(clientMap).sort((a,b) => b[1]-a[1]).slice(0,5);

  // ── Distribuição por prioridade ──
  const normal  = lots.filter(l => l.priority==='normal').length;
  const urgent  = lots.filter(l => l.priority==='urgent').length;
  const sameday = lots.filter(l => l.priority==='sameday').length;

  // ── Tempo médio por setor (para tabela) ──
  const sectorTimeData = WORK_TRACKABLE_SECTORS.map(s => {
    const stats = getSectorTimeStats(s);
    return { sector: s, ...stats };
  });

  // ── Total trabalhado e pausado globais ──
  let globalWorked = 0, globalPaused = 0, globalTotal = 0;
  lots.forEach(l => {
    const ts = getLotTimeSummary(l);
    globalWorked += ts.worked;
    globalPaused += ts.paused;
    globalTotal  += ts.total;
  });

  page.innerHTML = `
    <div class="page-header">
      <h2><i class="fas fa-chart-bar"></i> Relatórios e Análises</h2>
    </div>

    <!-- KPIs gerais -->
    <div class="metrics-row">
      <div class="metric-card metric-blue">
        <div class="metric-num">${total}</div>
        <div class="metric-label">Total de Lotes</div>
      </div>
      <div class="metric-card metric-purple">
        <div class="metric-num">${avgPerDay}</div>
        <div class="metric-label">Lotes/Dia (média)</div>
      </div>
      <div class="metric-card metric-green">
        <div class="metric-num">${delivered.length}</div>
        <div class="metric-label">Entregues</div>
      </div>
      <div class="metric-card metric-orange">
        <div class="metric-num">${avgDelivPerDay}</div>
        <div class="metric-label">Entregas/Dia (média)</div>
      </div>
      <div class="metric-card metric-red">
        <div class="metric-num">${late.length}</div>
        <div class="metric-label">Atrasados</div>
      </div>
      <div class="metric-card metric-yellow">
        <div class="metric-num">${routes.length}</div>
        <div class="metric-label">Rotas Criadas</div>
      </div>
    </div>

    <!-- KPIs de tempo -->
    <div class="metrics-row" style="margin-top:.75rem">
      <div class="metric-card" style="border-color:rgba(34,197,94,.3)">
        <div class="metric-num" style="color:#22c55e">${working.length}</div>
        <div class="metric-label">Em Trabalho Agora</div>
      </div>
      <div class="metric-card" style="border-color:rgba(245,158,11,.3)">
        <div class="metric-num" style="color:#f59e0b">${paused.length}</div>
        <div class="metric-label">Pausados Agora</div>
      </div>
      <div class="metric-card" style="border-color:rgba(59,130,246,.3)">
        <div class="metric-num" style="color:#3b82f6;font-size:1.1rem">${formatMs(globalWorked)}</div>
        <div class="metric-label">Total Trabalhado (todos)</div>
      </div>
      <div class="metric-card" style="border-color:rgba(249,115,22,.3)">
        <div class="metric-num" style="color:#f97316;font-size:1.1rem">${formatMs(globalPaused)}</div>
        <div class="metric-label">Total Pausado (todos)</div>
      </div>
      <div class="metric-card" style="border-color:rgba(139,92,246,.3)">
        <div class="metric-num" style="color:#8b5cf6;font-size:1.1rem">
          ${globalTotal > 0 ? Math.round(globalWorked/globalTotal*100) : 0}%
        </div>
        <div class="metric-label">Eficiência Global</div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-row">
      <div class="chart-card">
        <h4><i class="fas fa-chart-bar"></i> Passagem por Setor</h4>
        <div style="height:220px"><canvas id="rptChartSectors"></canvas></div>
      </div>
      <div class="chart-card">
        <h4><i class="fas fa-chart-pie"></i> Distribuição por Prioridade</h4>
        <div style="height:220px"><canvas id="rptChartPriority"></canvas></div>
      </div>
    </div>

    <!-- Tabela de tempos por setor -->
    <div class="section-card">
      <h3><i class="fas fa-stopwatch"></i> Estatísticas de Tempo por Setor</h3>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Setor</th>
              <th>Lotes analisados</th>
              <th>⏱ Méd. Total no Setor</th>
              <th style="color:#22c55e">▶ Méd. Trabalhado</th>
              <th style="color:#f59e0b">⏸ Méd. Pausado</th>
              <th style="color:#94a3b8">💤 Méd. Aguardando</th>
              <th>Eficiência</th>
            </tr>
          </thead>
          <tbody>
            ${sectorTimeData.map(d => {
              const eff = d.avgTotal > 0 ? Math.round(d.avgWorked / d.avgTotal * 100) : 0;
              const effColor = eff >= 70 ? '#22c55e' : eff >= 40 ? '#f59e0b' : '#ef4444';
              return `
                <tr>
                  <td>
                    <span class="sector-tag" style="background:${SECTOR_COLORS[d.sector]||'#6b7280'}">
                      ${SECTOR_LABELS[d.sector]}
                    </span>
                  </td>
                  <td style="text-align:center">${d.count}</td>
                  <td>${d.count > 0 ? formatMs(d.avgTotal) : '–'}</td>
                  <td style="color:#22c55e">${d.count > 0 ? formatMs(d.avgWorked) : '–'}</td>
                  <td style="color:#f59e0b">${d.count > 0 ? formatMs(d.avgPaused) : '–'}</td>
                  <td style="color:#94a3b8">${d.count > 0 ? formatMs(d.avgIdle) : '–'}</td>
                  <td>
                    ${d.count > 0 ? `
                    <div style="display:flex;align-items:center;gap:.5rem">
                      <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;min-width:60px">
                        <div style="height:100%;width:${eff}%;background:${effColor};border-radius:3px;transition:width .5s"></div>
                      </div>
                      <span style="color:${effColor};font-weight:600;font-size:.8rem">${eff}%</span>
                    </div>` : '–'}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:.75rem;color:var(--text3);margin-top:.5rem">
        <i class="fas fa-info-circle"></i>
        Eficiência = Tempo Trabalhado ÷ Tempo Total no Setor.
        Inclui lotes atualmente no setor e lotes que já passaram por ele.
      </p>
    </div>

    <!-- Chart: tempo médio trabalhado x pausado por setor -->
    <div class="section-card">
      <h3><i class="fas fa-chart-area"></i> Tempo Médio Trabalhado vs Pausado por Setor</h3>
      <div style="height:260px"><canvas id="rptChartTime"></canvas></div>
    </div>

    <!-- Top 3 prioridade -->
    <div class="section-card">
      <h3><i class="fas fa-trophy text-warning"></i> Top 3 Lotes de Maior Prioridade</h3>
      <div class="top-list">
        ${lots.filter(l => l.priority==='sameday' && l.sector!=='entregue').slice(0,3)
          .concat(lots.filter(l => l.priority==='urgent' && l.sector!=='entregue').slice(0,3))
          .slice(0,3)
          .map((lot, i) => {
            const ts = getLotTimeSummary(lot);
            return `
              <div class="top-item priority-item ${lot.priority==='sameday'?'priority-sameday':'priority-urgent'}"
                   onclick="openLotDetail('${lot.id}')">
                <span class="top-rank">${i+1}º</span>
                <div>
                  <strong>#${escapeHtml(lot.number)}</strong> – ${escapeHtml(lot.client)}<br>
                  <small>${escapeHtml(lot.paint)} | ${SECTOR_LABELS[lot.sector]} | ${formatDate(lot.deliveryDate)}</small><br>
                  <small style="color:var(--text3)">
                    ⏱ Total: ${formatMs(ts.total)}
                    ${ts.worked>0 ? ` · ▶ ${formatMs(ts.worked)}` : ''}
                    ${ts.paused>0 ? ` · ⏸ ${formatMs(ts.paused)}` : ''}
                  </small>
                </div>
                <span class="priority-badge" style="background:${PRIORITY_COLORS[lot.priority]}">${PRIORITY_LABELS[lot.priority]}</span>
              </div>`;
          }).join('') || '<p class="text-muted">Nenhum pedido urgente ativo</p>'}
      </div>
    </div>

    <!-- Tabela de todos os lotes -->
    <div class="section-card">
      <h3><i class="fas fa-table"></i> Todos os Lotes</h3>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Lote</th><th>Cliente</th><th>Tinta</th><th>Qtd</th>
              <th>Setor</th><th>Prioridade</th><th>Entrega</th>
              <th>⏱ Setor</th><th>▶ Trab.</th><th>⏸ Pausa</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${lots.slice().sort((a,b) => {
              const prio = {sameday:0,urgent:1,normal:2};
              return (prio[a.priority]||2) - (prio[b.priority]||2);
            }).map(lot => {
              const ts = getLotTimeSummary(lot);
              const statusDot = lot.lotStatus==='working'
                ? `<span style="color:#22c55e">▶ Trab.</span>`
                : lot.lotStatus==='paused'
                ? `<span style="color:#f59e0b">⏸ Pausado</span>`
                : `<span style="color:#64748b">💤 Ocioso</span>`;
              return `
                <tr onclick="openLotDetail('${lot.id}')" style="cursor:pointer">
                  <td><strong>#${escapeHtml(lot.number)}</strong></td>
                  <td>${escapeHtml(lot.client)}</td>
                  <td>${escapeHtml(lot.paint)}</td>
                  <td>${escapeHtml(String(lot.qty))} ${escapeHtml(lot.unit||'Kg')}</td>
                  <td><span class="sector-tag" style="background:${SECTOR_COLORS[lot.sector]||'#6b7280'}">${SECTOR_LABELS[lot.sector]}</span></td>
                  <td><span class="priority-badge" style="background:${PRIORITY_COLORS[lot.priority]}">${PRIORITY_LABELS[lot.priority]}</span></td>
                  <td class="${isLate(lot)?'text-danger':isToday(lot.deliveryDate)?'text-warning':''}">${formatDate(lot.deliveryDate)}</td>
                  <td style="font-size:.78rem;color:var(--text2)">${formatMs(ts.total)}</td>
                  <td style="font-size:.78rem;color:#22c55e">${ts.worked>0?formatMs(ts.worked):'–'}</td>
                  <td style="font-size:.78rem;color:#f59e0b">${ts.paused>0?formatMs(ts.paused):'–'}</td>
                  <td>${statusDot}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Top clientes + Rotas -->
    <div class="charts-row">
      <div class="section-card">
        <h3><i class="fas fa-building"></i> Clientes com Mais Pedidos</h3>
        <div class="top-list">
          ${topClients.map(([client, count], i) => `
            <div class="top-item">
              <span class="top-rank">${i+1}º</span>
              <span class="top-name">${escapeHtml(client)}</span>
              <span class="top-count">${count} pedido(s)</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="section-card">
        <h3><i class="fas fa-route"></i> Estatísticas de Rotas</h3>
        <table class="detail-table">
          <tr><td>Total de rotas</td><td>${routes.length}</td></tr>
          <tr><td>Rotas concluídas</td><td>${routes.filter(r=>r.status==='completed').length}</td></tr>
          <tr><td>Em andamento</td><td>${routes.filter(r=>r.status==='in_progress').length}</td></tr>
          <tr><td>Aguardando saída</td><td>${routes.filter(r=>r.status==='pending').length}</td></tr>
          <tr><td>Total de paradas</td><td>${routes.reduce((acc,r)=>acc+r.lots.length,0)}</td></tr>
          <tr><td>Paradas entregues</td><td>${routes.reduce((acc,r)=>acc+r.lots.filter(l=>l.status==='delivered').length,0)}</td></tr>
        </table>
      </div>
    </div>

    <!-- ── SEÇÃO: LOTES REPROVADOS ── -->
    ${renderRejectionSection(lots)}
  `;

  setTimeout(() => {
    // Chart: passagem por setor
    const ctxS = document.getElementById('rptChartSectors');
    if (ctxS) {
      if (ctxS._chart) ctxS._chart.destroy();
      ctxS._chart = new Chart(ctxS, {
        type: 'bar',
        data: {
          labels: SECTORS.map(s => SECTOR_LABELS[s]),
          datasets: [{ label:'Passagens', data:sectorDist.map(d=>d.count), backgroundColor:SECTORS.map(s=>SECTOR_COLORS[s]), borderRadius:6 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}},
          scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'rgba(255,255,255,.05)'}},x:{grid:{display:false}}}
        }
      });
    }

    // Chart: reprovações por setor
    const ctxRej = document.getElementById('rptChartRejections');
    if (ctxRej) {
      if (ctxRej._chart) ctxRej._chart.destroy();
      const rejStats = getRejectionStats();
      const rejSectors = SECTORS.filter(s => rejStats.bySector[s] > 0);
      if (rejSectors.length > 0) {
        ctxRej._chart = new Chart(ctxRej, {
          type: 'bar',
          data: {
            labels: rejSectors.map(s => SECTOR_LABELS[s]),
            datasets: [{
              label: 'Reprovações',
              data: rejSectors.map(s => rejStats.bySector[s]),
              backgroundColor: rejSectors.map(s => SECTOR_COLORS[s] + 'cc'),
              borderColor: rejSectors.map(s => SECTOR_COLORS[s]),
              borderWidth: 2, borderRadius: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        });
      }
    }

    // Chart: distribuição prioridade
    const ctxP = document.getElementById('rptChartPriority');
    if (ctxP) {
      if (ctxP._chart) ctxP._chart.destroy();
      ctxP._chart = new Chart(ctxP, {
        type: 'doughnut',
        data: {
          labels:['Normal','Urgente','Mesmo Dia'],
          datasets:[{data:[normal,urgent,sameday],backgroundColor:['#22c55e','#f59e0b','#ef4444'],borderWidth:2,borderColor:'transparent'}]
        },
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:11}}}}}
      });
    }

    // Chart: tempo médio trabalhado vs pausado por setor
    const ctxT = document.getElementById('rptChartTime');
    if (ctxT && sectorTimeData.some(d => d.count > 0)) {
      if (ctxT._chart) ctxT._chart.destroy();
      const validSectors = sectorTimeData.filter(d => d.count > 0);
      ctxT._chart = new Chart(ctxT, {
        type: 'bar',
        data: {
          labels: validSectors.map(d => SECTOR_LABELS[d.sector]),
          datasets: [
            {
              label: '▶ Trabalhado (média)',
              data: validSectors.map(d => Math.round(d.avgWorked / 60000)),
              backgroundColor: 'rgba(34,197,94,.75)',
              borderRadius: 5
            },
            {
              label: '⏸ Pausado (média)',
              data: validSectors.map(d => Math.round(d.avgPaused / 60000)),
              backgroundColor: 'rgba(245,158,11,.75)',
              borderRadius: 5
            },
            {
              label: '💤 Aguardando (média)',
              data: validSectors.map(d => Math.round(d.avgIdle / 60000)),
              backgroundColor: 'rgba(100,116,139,.5)',
              borderRadius: 5
            }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{labels:{color:'#94a3b8',font:{size:11}}},
            tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.parsed.y}min`}}
          },
          scales:{
            x:{stacked:false,grid:{display:false},ticks:{color:'#64748b'}},
            y:{beginAtZero:true,stacked:false,ticks:{color:'#64748b',callback:v=>`${v}min`},grid:{color:'rgba(255,255,255,.04)'}}
          }
        }
      });
    }
  }, 100);
}

// ===================================================
// REJECTION SECTION BUILDER
// ===================================================
function renderRejectionSection(lots) {
  const rejected = lots.filter(l => l.rejected);
  const rejStats = getRejectionStats();

  if (rejected.length === 0) {
    return `
    <div class="section-card" id="rejectionSection">
      <h3><i class="fas fa-ban" style="color:#ef4444"></i> Lotes Reprovados</h3>
      <div class="empty-state" style="padding:1.5rem 0">
        <i class="fas fa-check-circle" style="font-size:2rem;color:#22c55e"></i>
        <p style="margin-top:.5rem;color:var(--text3)">Nenhum lote reprovado. Excelente!</p>
      </div>
    </div>`;
  }

  // Setor que mais reprova
  const topRejSector = rejStats.sorted[0];

  // Tabela de reprovações
  const tableRows = rejected
    .slice()
    .sort((a, b) => (b.rejectedAt || 0) - (a.rejectedAt || 0))
    .map(lot => {
      const sectorLabel = SECTOR_LABELS[lot.rejectedSector || lot.sector] || lot.rejectedSector || '–';
      const rejDate = lot.rejectedAt
        ? new Date(lot.rejectedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '–';
      return `
        <tr onclick="openLotDetail('${lot.id}')" style="cursor:pointer">
          <td><strong style="color:#fca5a5">#${escapeHtml(lot.number)}</strong></td>
          <td>${escapeHtml(lot.client)}</td>
          <td>${escapeHtml(lot.paint)}</td>
          <td><span class="sector-tag" style="background:${SECTOR_COLORS[lot.rejectedSector||lot.sector]||'#6b7280'}">${sectorLabel}</span></td>
          <td style="font-size:.78rem;color:var(--text2)">${escapeHtml(lot.rejectedBy || '–')}</td>
          <td style="font-size:.78rem;color:var(--text2)">${rejDate}</td>
          <td style="font-size:.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text3)" title="${escapeHtml(lot.rejectedReason)}">${escapeHtml(lot.rejectedReason || '–')}</td>
        </tr>`;
    }).join('');

  // Ranking de setores com mais reprovações
  const rankingRows = rejStats.sorted.map(([sector, count], i) => `
    <div class="top-item" style="padding:.5rem 0;border-bottom:1px solid var(--border)">
      <span class="top-rank" style="background:${i===0?'#ef4444':i===1?'rgba(239,68,68,.5)':'rgba(239,68,68,.2)'};color:${i===0?'#fff':'#fca5a5'}">${i+1}º</span>
      <span class="top-name" style="color:${SECTOR_COLORS[sector]||'#ef4444'}">${SECTOR_LABELS[sector] || sector}</span>
      <span class="top-count" style="color:#fca5a5">${count} reprovação(ões)</span>
    </div>`).join('');

  return `
  <div class="section-card" id="rejectionSection" style="border-color:rgba(239,68,68,.25)">
    <h3><i class="fas fa-ban" style="color:#ef4444"></i> Lotes Reprovados
      <span style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#fca5a5;font-size:.8rem;padding:.15rem .55rem;border-radius:8px;margin-left:.6rem;font-weight:700">${rejected.length}</span>
    </h3>

    <!-- Banner setor que mais reprova -->
    ${topRejSector ? `
    <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:.7rem 1rem;margin-bottom:1rem;display:flex;align-items:center;gap:.8rem">
      <span style="font-size:1.4rem">⛔</span>
      <div>
        <div style="font-size:.8rem;color:var(--text3)">Setor que mais reprova ordens de produção</div>
        <div style="font-weight:700;color:#fca5a5;font-size:1rem">
          ${SECTOR_LABELS[topRejSector[0]] || topRejSector[0]}
          <span style="font-size:.8rem;font-weight:400;margin-left:.5rem">(${topRejSector[1]} reprovação(ões))</span>
        </div>
      </div>
    </div>` : ''}

    <!-- Ranking + Gráfico -->
    <div class="charts-row" style="margin-bottom:1rem">
      <div style="flex:1;min-width:160px">
        <h4 style="margin-bottom:.5rem;font-size:.8rem;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">
          <i class="fas fa-ranking-star"></i> Ranking por Setor
        </h4>
        ${rankingRows || '<p class="text-muted" style="font-size:.8rem">–</p>'}
      </div>
      <div class="chart-card" style="flex:2;min-height:180px">
        <h4><i class="fas fa-chart-bar" style="color:#ef4444"></i> Reprovações por Setor</h4>
        <div style="height:160px"><canvas id="rptChartRejections"></canvas></div>
      </div>
    </div>

    <!-- Tabela de lotes reprovados -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Lote</th><th>Cliente</th><th>Produto</th>
            <th>Setor Reprovado</th><th>Reprovado Por</th>
            <th>Data/Hora</th><th>Motivo</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>`;
}
