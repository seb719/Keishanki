/**
 * 傾斜ん機 - 立場別精算計算機
 * 
 * 計算ロジック:
 * - 最上位（1位）: n×x 円
 * - 2位: n×x - y 円
 * - 3位: n×x - 2y 円
 * - ...
 * - 最下位（k位）: n×x - (k-1)y = x 円
 * 
 * 制約: (k-1)y = (n-1)x より y = (n-1)x/(k-1)
 * 合計: SUM = Σ count_i × (n×x - (i-1)y)
 */

const DOM = {
  total: document.getElementById('total'),
  multiplier: document.getElementById('multiplier'),
  differential: document.getElementById('differential'),
  recommendedY: document.getElementById('recommendedY'),
  positionsEditor: document.getElementById('positionsEditor'),
  btnAddPosition: document.getElementById('btnAddPosition'),
  resultsBody: document.getElementById('resultsBody'),
  resultsSummary: document.getElementById('resultsSummary'),
  baseAmount: document.getElementById('baseAmount'),
  effectiveMultiplier: document.getElementById('effectiveMultiplier'),
  calculatedTotal: document.getElementById('calculatedTotal'),
  resultMessage: document.getElementById('resultMessage'),
  btnCopyResult: document.getElementById('btnCopyResult'),
};

let lastResultRows = [];

function getPositions() {
  const rows = DOM.positionsEditor.querySelectorAll('.position-row');
  return Array.from(rows).map((row, i) => ({
    rank: i,
    name: row.querySelector('.position-name').value.trim() || `役職${i + 1}`,
    count: Math.max(0, parseInt(row.querySelector('.position-count').value, 10) || 0),
  }));
}

function formatYen(n) {
  if (n == null || isNaN(n)) return '—';
  return '¥' + Math.round(n).toLocaleString();
}

/**
 * 推奨yモード: SUM と n から x, y を一意に決定
 * 固定yモード: ユーザーがyを指定 → x を SUM から逆算、倍率は実効値になる
 */
function calculate() {
  const total = parseFloat(DOM.total.value) || 0;
  const n = parseFloat(DOM.multiplier.value) || 1;
  const userY = DOM.differential.value.trim();
  const hasFixedY = userY !== '';
  const fixedY = parseFloat(userY) || 0;

  const positions = getPositions();
  const validPositions = positions.filter((p) => p.count > 0);

  if (total <= 0) {
    showError('合計金額を正の数で入力してください。');
    return;
  }

  if (n < 1) {
    showError('倍率は1以上で入力してください。');
    return;
  }

  if (validPositions.length === 0) {
    showError('少なくとも1つの役職に1人以上を設定してください。');
    return;
  }

  const k = validPositions.length;
  const totalPeople = validPositions.reduce((s, p) => s + p.count, 0);

  // 重み M = Σ (rank_index) * count_i  (0-indexed: 1位=0, 2位=1, ...)
  const M = validPositions.reduce((s, p) => s + p.rank * p.count, 0);

  let x, y, calculatedTotal, effectiveN;

  if (hasFixedY && fixedY >= 0) {
    // 固定yモード: y を指定、x を合計から逆算
    // SUM = Σ count_i * (x + (k-1-i)*y)  where rank i pays x + (k-1-i)*y
    // 最下位(rank k-1)がx、最上位(rank 0)が x + (k-1)y
    // SUM = x*N + y * Σ count_i * (k-1-i)
    const coeff = validPositions.reduce(
      (s, p) => s + p.count * (k - 1 - p.rank),
      0
    );
    x = (total - fixedY * coeff) / totalPeople;
    y = fixedY;

    if (x < 0) {
      showError(
        `定額差分 ${formatYen(fixedY)} が大きすぎます。推奨値を使うか、小さくしてください。`
      );
      return;
    }

    const topAmount = x + (k - 1) * y;
    effectiveN = topAmount / x;
    calculatedTotal = total;
  } else {
    // 推奨yモード: y = (n-1)x/(k-1), SUM から x を求める
    if (k === 1) {
      x = total / totalPeople;
      y = 0;
      effectiveN = 1;
    } else {
      // amount_i = n*x - (i)*y, i=0..k-1 で 最上位i=0, 最下位i=k-1
      // 最下位: n*x - (k-1)*y = x  →  (n-1)x = (k-1)y  →  y = (n-1)x/(k-1)
      // SUM = Σ count_i * (n*x - rank*y)  rank は 0,1,...,k-1
      const rankWeight = validPositions.reduce(
        (s, p) => s + p.count * p.rank,
        0
      );
      // SUM = n*x*N - y*rankWeight,  y = (n-1)x/(k-1)
      // SUM = n*x*N - (n-1)x/(k-1)*rankWeight
      // x = SUM / (n*N - (n-1)*rankWeight/(k-1))
      const denom = n * totalPeople - ((n - 1) * rankWeight) / (k - 1);

      if (denom <= 0) {
        showError(
          '倍率と人数の組み合わせで計算できません。倍率を調整するか、人数配分を変えてください。'
        );
        return;
      }

      x = total / denom;
      y = (n - 1) * x / (k - 1);
      effectiveN = n;
    }
    calculatedTotal = total;
  }

  // 推奨yの表示（固定yモードでないとき）
  if (!hasFixedY) {
    DOM.recommendedY.textContent = Math.round(y).toLocaleString();
  } else {
    DOM.recommendedY.textContent = `（固定: ${Math.round(y).toLocaleString()}）`;
  }

  // サマリー更新
  DOM.baseAmount.textContent = formatYen(x);
  DOM.effectiveMultiplier.textContent =
    effectiveN.toFixed(2) + '倍';
  DOM.calculatedTotal.textContent = formatYen(calculatedTotal);

  // テーブル生成
  const rows = validPositions.map((p) => {
    const amountPerPerson = x + (k - 1 - p.rank) * y;
    const subtotal = amountPerPerson * p.count;
    return {
      rank: p.rank + 1,
      name: p.name,
      count: p.count,
      amount: amountPerPerson,
      subtotal,
    };
  });

  lastResultRows = rows;

  DOM.resultsBody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td class="rank-cell">${r.rank}</td>
      <td>${r.name}</td>
      <td>${r.count}人</td>
      <td class="amount-cell">${formatYen(r.amount)}</td>
      <td class="subtotal-cell">${formatYen(r.subtotal)}</td>
    </tr>
  `
    )
    .join('');

  const targetTotal = parseFloat(DOM.total.value) || 0;
  const diff = Math.abs(calculatedTotal - targetTotal);
  if (diff > 1) {
    DOM.resultMessage.textContent = `※ 計算合計と入力合計に ${formatYen(diff)} の差があります。`;
    DOM.resultMessage.className = 'result-message info';
  } else if (hasFixedY && effectiveN < n) {
    DOM.resultMessage.textContent = `※ 定額差分を固定したため、実効倍率は目標の ${n}倍 より下がっています。`;
    DOM.resultMessage.className = 'result-message info';
  } else {
    DOM.resultMessage.textContent = '';
    DOM.resultMessage.className = 'result-message';
  }
}

function showError(msg) {
  DOM.resultMessage.textContent = msg;
  DOM.resultMessage.className = 'result-message error';
  DOM.resultsBody.innerHTML = '';
  DOM.recommendedY.textContent = '—';
  DOM.baseAmount.textContent = '—';
  DOM.effectiveMultiplier.textContent = '—';
  DOM.calculatedTotal.textContent = '—';
  lastResultRows = [];
}

function formatYenCopy(n) {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString();
}

function copyResultsToClipboard() {
  if (lastResultRows.length === 0) return;

  const lines = [
    '【精算結果】',
    '',
    'No\t役職\t人数\t1人あたり\t小計',
    ...lastResultRows.map((r) =>
      [r.rank, r.name, r.count + '人', '¥' + formatYenCopy(r.amount), '¥' + formatYenCopy(r.subtotal)].join('\t')
    ),
    '',
    '合計: ¥' + formatYenCopy(lastResultRows.reduce((s, r) => s + r.subtotal, 0)),
  ];

  const text = lines.join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = DOM.btnCopyResult;
    if (btn) {
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋';
        btn.classList.remove('copied');
      }, 1500);
    }
  });
}

function addPositionRow() {
  const rows = DOM.positionsEditor.querySelectorAll('.position-row');
  const nextRank = rows.length;
  const row = document.createElement('div');
  row.className = 'position-row';
  row.dataset.rank = nextRank;
  row.innerHTML = `
    <span class="drag-handle" aria-label="並び替え">⋮⋮</span>
    <span class="rank-badge">No.${nextRank + 1}</span>
    <input type="text" class="position-name" placeholder="役職名" value="">
    <input type="number" class="position-count" placeholder="人数" min="0" value="0">
    <button type="button" class="btn-remove" aria-label="削除">×</button>
  `;
  row.draggable = true;
  DOM.positionsEditor.appendChild(row);

  setupRowEvents(row);

  updateRankBadges();
  calculate();
}

function updateRankBadges() {
  const rows = DOM.positionsEditor.querySelectorAll('.position-row');
  rows.forEach((row, i) => {
    row.dataset.rank = i;
    row.querySelector('.rank-badge').textContent = `No.${i + 1}`;
  });
}

// イベント初期化
function init() {
  [DOM.total, DOM.multiplier, DOM.differential].forEach((el) => {
    el?.addEventListener('input', calculate);
    el?.addEventListener('change', calculate);
  });

  DOM.btnAddPosition?.addEventListener('click', addPositionRow);
  DOM.btnCopyResult?.addEventListener('click', copyResultsToClipboard);

  DOM.positionsEditor?.querySelectorAll('.position-row').forEach((row) => {
    setupRowEvents(row);
  });

  initDragDrop();
  calculate();
}

function setupRowEvents(row) {
  row.querySelector('.btn-remove')?.addEventListener('click', () => {
    row.remove();
    updateRankBadges();
    calculate();
  });
  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', calculate);
    input.addEventListener('change', calculate);
  });
}

function initDragDrop() {
  let draggedRow = null;

  DOM.positionsEditor?.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.position-row');
    if (row) {
      draggedRow = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    }
  });

  DOM.positionsEditor?.addEventListener('dragend', (e) => {
    const row = e.target.closest('.position-row');
    if (row) row.classList.remove('dragging');
    draggedRow = null;
  });

  DOM.positionsEditor?.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('.position-row');
    if (target && draggedRow && target !== draggedRow) {
      const rect = target.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      target.classList.toggle('drag-over-top', e.clientY < mid);
      target.classList.toggle('drag-over-bottom', e.clientY >= mid);
    }
  });

  DOM.positionsEditor?.addEventListener('dragleave', (e) => {
    if (!e.target.closest('.position-row')) return;
    const row = e.target.closest('.position-row');
    row?.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  DOM.positionsEditor?.addEventListener('drop', (e) => {
    e.preventDefault();
    const target = e.target.closest('.position-row');
    DOM.positionsEditor?.querySelectorAll('.position-row').forEach((r) => {
      r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    if (target && draggedRow && target !== draggedRow) {
      const rect = target.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        DOM.positionsEditor.insertBefore(draggedRow, target);
      } else {
        DOM.positionsEditor.insertBefore(draggedRow, target.nextSibling);
      }
      updateRankBadges();
      calculate();
    }
  });
}

init();
