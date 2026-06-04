// 状態管理
let state = {
  periods: [],
  activePeriodId: null,
  currentView: 'top' // 'top' または 'details'
};

// デフォルトの作業工程テンプレート
const DEFAULT_TASKS_TEMPLATE = [
  "朝礼・体調確認・KY活動（危険予知）",
  "機材・車両の始業前点検",
  "午前の作業開始",
  "中間進捗確認と水分補給（休憩）",
  "昼休憩・健康状態チェック",
  "午後の作業開始",
  "片付け・資材整理・清掃",
  "終礼・本日の日報作成と提出"
];

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerServiceWorker();
  render();
  setupEventListeners();
  
  // 今日の日付を新規登録のデフォルト値に設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
});

// データの読み込み
function loadData() {
  const savedData = localStorage.getItem('shift_manager_data');
  if (savedData) {
    try {
      state.periods = JSON.parse(savedData);
    } catch (e) {
      console.error('データの解析に失敗しました。初期化します。', e);
      state.periods = [];
    }
  } else {
    // 初回起動時のサンプルデータ
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 6);
    
    const formattedToday = today.toISOString().split('T')[0];
    const formattedFuture = futureDate.toISOString().split('T')[0];
    
    state.periods = [
      {
        id: Date.now(),
        startDate: formattedToday,
        endDate: formattedFuture,
        tasks: DEFAULT_TASKS_TEMPLATE.map((text, idx) => ({
          id: Date.now() + idx,
          text: text,
          checked: idx < 2 // 最初の2つを完了済みにしておく
        }))
      }
    ];
    saveData();
  }
}

// データの保存
function saveData() {
  localStorage.setItem('shift_manager_data', JSON.stringify(state.periods));
}

// 画面描画
function render() {
  // ビューの切り替え
  document.getElementById('topView').classList.toggle('active', state.currentView === 'top');
  document.getElementById('detailsView').classList.toggle('active', state.currentView === 'details');

  if (state.currentView === 'top') {
    renderTopView();
  } else if (state.currentView === 'details') {
    renderDetailsView();
  }
}

// トップ画面のレンダリング
function renderTopView() {
  const periodListContainer = document.getElementById('periodList');
  periodListContainer.innerHTML = '';

  if (state.periods.length === 0) {
    periodListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <p>登録された期間はありません。<br>上のフォームから新しく追加してください。</p>
      </div>
    `;
    return;
  }

  // 日付順にソート（開始日順）
  const sortedPeriods = [...state.periods].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  sortedPeriods.forEach(period => {
    const totalTasks = period.tasks.length;
    const completedTasks = period.tasks.filter(t => t.checked).length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const formattedStart = formatDateJapanese(period.startDate);
    const formattedEnd = formatDateJapanese(period.endDate);

    const card = document.createElement('div');
    card.className = 'period-card';
    card.innerHTML = `
      <div class="period-card-header">
        <div class="period-title">📅 ${formattedStart} 〜 ${formattedEnd}</div>
        <div class="period-stats">${completedTasks}/${totalTasks} 完了</div>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progressPercent}%"></div>
      </div>
      <div class="card-footer">
        <span class="card-hint">👉 タップしてチェック項目を確認</span>
        <button class="btn-danger-icon delete-period-btn" data-id="${period.id}" title="期間を削除">
          🗑️
        </button>
      </div>
    `;

    // カード本体をタップしたら詳細へ
    card.addEventListener('click', (e) => {
      // 削除ボタンをクリックした場合は遷移しない
      if (e.target.closest('.delete-period-btn')) {
        return;
      }
      navigateToDetails(period.id);
    });

    // 削除ボタンのイベント
    card.querySelector('.delete-period-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`この期間（${formattedStart} 〜 ${formattedEnd}）とすべてのチェック項目を削除しますか？`)) {
        deletePeriod(period.id);
      }
    });

    periodListContainer.appendChild(card);
  });
}

// 詳細画面（チェックリスト）のレンダリング
function renderDetailsView() {
  const period = state.periods.find(p => p.id === state.activePeriodId);
  if (!period) {
    navigateToTop();
    return;
  }

  const formattedStart = formatDateJapanese(period.startDate);
  const formattedEnd = formatDateJapanese(period.endDate);
  
  // タイトル設定
  document.getElementById('detailsTitle').innerText = `${formattedStart} 〜 ${formattedEnd}`;

  const checklistContainer = document.getElementById('checklist');
  checklistContainer.innerHTML = '';

  if (period.tasks.length === 0) {
    checklistContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>工程項目がありません。<br>下のフォームから新しく追加してください。</p>
      </div>
    `;
    return;
  }

  period.tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = `checklist-item ${task.checked ? 'checked' : ''}`;
    item.innerHTML = `
      <div class="checklist-item-left">
        <div class="custom-checkbox">
          <i>✓</i>
        </div>
        <span class="task-text">${escapeHtml(task.text)}</span>
      </div>
      <button class="btn-danger-icon delete-task-btn" data-id="${task.id}" title="項目を削除">
        ✕
      </button>
    `;

    // チェック切り替えイベント
    item.querySelector('.checklist-item-left').addEventListener('click', () => {
      toggleTask(period.id, task.id);
    });

    // 項目削除イベント
    item.querySelector('.delete-task-btn').addEventListener('click', () => {
      deleteTask(period.id, task.id);
    });

    checklistContainer.appendChild(item);
  });
}

// 日付を「〇月〇日」フォーマットに変換
function formatDateJapanese(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}

// HTMLエスケープ処理
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 画面遷移ロジック
function navigateToDetails(periodId) {
  state.activePeriodId = periodId;
  state.currentView = 'details';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navigateToTop() {
  state.activePeriodId = null;
  state.currentView = 'top';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 期間の追加
function addPeriod(startDate, endDate) {
  if (!startDate || !endDate) {
    showToast('開始日と終了日を入力してください。');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showToast('終了日は開始日より後の日付にしてください。');
    return;
  }

  // デフォルトタスクのコピーを含めて新規期間オブジェクトを作成
  const newPeriod = {
    id: Date.now(),
    startDate: startDate,
    endDate: endDate,
    tasks: DEFAULT_TASKS_TEMPLATE.map((text, idx) => ({
      id: Date.now() + idx + 100,
      text: text,
      checked: false
    }))
  };

  state.periods.push(newPeriod);
  saveData();
  render();
  showToast('新しい期間を追加しました！');
}

// 期間の削除
function deletePeriod(id) {
  state.periods = state.periods.filter(p => p.id !== id);
  saveData();
  render();
  showToast('期間を削除しました。');
}

// タスクの完了トグル
function toggleTask(periodId, taskId) {
  const period = state.periods.find(p => p.id === periodId);
  if (period) {
    const task = period.tasks.find(t => t.id === taskId);
    if (task) {
      task.checked = !task.checked;
      saveData();
      render();
    }
  }
}

// タスクの追加
function addTask(periodId, text) {
  if (!text.trim()) {
    showToast('作業項目を入力してください。');
    return;
  }

  const period = state.periods.find(p => p.id === periodId);
  if (period) {
    const newTask = {
      id: Date.now(),
      text: text.trim(),
      checked: false
    };
    period.tasks.push(newTask);
    saveData();
    render();
    showToast('作業項目を追加しました！');
  }
}

// タスクの削除
function deleteTask(periodId, taskId) {
  const period = state.periods.find(p => p.id === periodId);
  if (period) {
    period.tasks = period.tasks.filter(t => t.id !== taskId);
    saveData();
    render();
    showToast('項目を削除しました。');
  }
}

// トースト通知の表示
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// イベントリスナーの設定
function setupEventListeners() {
  // 期間追加フォーム
  document.getElementById('addPeriodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    addPeriod(startDate, endDate);
  });

  // 詳細画面から戻るボタン
  document.getElementById('backBtn').addEventListener('click', navigateToTop);

  // 新規タスク追加フォーム
  document.getElementById('addTaskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const taskInput = document.getElementById('newTaskInput');
    addTask(state.activePeriodId, taskInput.value);
    taskInput.value = '';
  });

  // 設定/バックアップモーダルの開閉
  const modal = document.getElementById('backupModal');
  document.getElementById('settingsBtn').addEventListener('click', () => {
    modal.classList.add('active');
  });
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    modal.classList.remove('active');
  });
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  // データエクスポート
  document.getElementById('exportBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(state.periods, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shift_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('バックアップファイルをダウンロードしました。');
  });

  // データインポート
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (Array.isArray(importedData)) {
          state.periods = importedData;
          saveData();
          render();
          modal.classList.remove('active');
          showToast('データを正常にインポートしました！');
        } else {
          showToast('無効なファイル形式です。');
        }
      } catch (err) {
        showToast('ファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  });
}

// Service Worker の登録
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('Service Worker が正常に登録されました:', registration.scope);
        })
        .catch((error) => {
          console.error('Service Worker の登録に失敗しました:', error);
        });
    });
  }
}
