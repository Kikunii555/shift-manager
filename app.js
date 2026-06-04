// 状態管理
let state = {
  periods: [],
  activePeriodId: null,
  currentView: 'top' // 'top' または 'details'
};

// カテゴリ定義
const CATEGORIES = [
  { id: 1, name: "1. 作成前の準備段階" },
  { id: 2, name: "2. 実際にシフトを入れて記入" },
  { id: 3, name: "3. PCのシステムに入力して上に報告" },
  { id: 4, name: "4. 確認後認証が出たら修正して仕上げ" },
  { id: 5, name: "5. 最後の仕上げと次の準備" }
];

// 初期設定のチェック項目テンプレート
const DEFAULT_TASKS_TEMPLATE = [
  { categoryId: 1, text: "各スタッフの希望休・休暇申請の回収と確認" },
  { categoryId: 1, text: "必要人数（人員基準・稼働目標）の確認" },
  { categoryId: 1, text: "特別なイベントや繁忙期のスケジュールの確認" },
  { categoryId: 2, text: "公休数・連続勤務日数の上限チェック" },
  { categoryId: 2, text: "各時間帯・曜日の必要人員（スキルバランスなど）の確認" },
  { categoryId: 2, text: "夜勤明けの翌日シフト（連休ルール等）のチェック" },
  { categoryId: 3, text: "社内システム（PC）へのデータ入力" },
  { categoryId: 3, text: "入力ミス・転記ミスの最終ダブルチェック" },
  { categoryId: 3, text: "上司または管理部門への報告・承認申請の送信" },
  { categoryId: 4, text: "指摘事項や修正依頼の有無を確認" },
  { categoryId: 4, text: "必要に応じてシフトの微調整と修正箇所の再確認" },
  { categoryId: 4, text: "最終承認（認証）の獲得" },
  { categoryId: 5, text: "確定した勤務指定表の印刷・配布・共有（スタッフ周知）" },
  { categoryId: 5, text: "次の4週間（28日分）のスケジュール確認と、希望休提出締切のアナウンス" }
];

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerServiceWorker();
  render();
  setupEventListeners();
  
  // 開始日のデフォルト設定と終了日の自動計算（28日分）
  initDateInputs();
});

// 開始日・終了日の初期設定
function initDateInputs() {
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  startDateInput.value = todayStr;
  calculateAndSetEndDate(todayStr);

  // 開始日が変更されたら、自動で28日分（27日後）の終了日をセットする
  startDateInput.addEventListener('change', (e) => {
    calculateAndSetEndDate(e.target.value);
  });
}

// 終了日の自動計算 (開始日を含めて28日間 ＝ 開始日から27日後)
function calculateAndSetEndDate(startDateVal) {
  if (!startDateVal) return;
  const startDate = new Date(startDateVal);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 27); // 27日を足すことで開始日含めて28日になる
  
  const endDateInput = document.getElementById('endDate');
  endDateInput.value = endDate.toISOString().split('T')[0];
}

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
    // 初回起動時のサンプルデータ作成
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // サンプルの終了日（27日後）
    const end = new Date(today);
    end.setDate(today.getDate() + 27);
    const endStr = end.toISOString().split('T')[0];
    
    state.periods = [
      {
        id: Date.now(),
        startDate: todayStr,
        endDate: endStr,
        tasks: DEFAULT_TASKS_TEMPLATE.map((t, idx) => ({
          id: Date.now() + idx,
          categoryId: t.categoryId,
          text: t.text,
          checked: t.categoryId === 1 && idx === 0 // 最初の項目だけ完了にしておく
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
        <div class="period-title">📅 ${formattedStart} 〜 ${formattedEnd} (28日間)</div>
        <div class="period-stats">${completedTasks}/${totalTasks} 完了</div>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progressPercent}%"></div>
      </div>
      <div class="card-footer">
        <span class="card-hint">👉 タップして作成工程を確認</span>
        <button class="btn-danger-icon delete-period-btn" data-id="${period.id}" title="期間を削除">
          🗑️
        </button>
      </div>
    `;

    // カード本体をタップしたら詳細へ
    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-period-btn')) {
        return;
      }
      navigateToDetails(period.id);
    });

    // 削除ボタンのイベント
    card.querySelector('.delete-period-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`この期間（${formattedStart} 〜 ${formattedEnd}）の作成工程データをすべて削除しますか？`)) {
        deletePeriod(period.id);
      }
    });

    periodListContainer.appendChild(card);
  });
}

// 詳細画面（グループ化されたチェックリスト）のレンダリング
function renderDetailsView() {
  const period = state.periods.find(p => p.id === state.activePeriodId);
  if (!period) {
    navigateToTop();
    return;
  }

  const formattedStart = formatDateJapanese(period.startDate);
  const formattedEnd = formatDateJapanese(period.endDate);
  
  // タイトル設定
  document.getElementById('detailsTitle').innerText = `${formattedStart} 〜 ${formattedEnd} 勤務指定表作成`;

  const checklistContainer = document.getElementById('checklist');
  checklistContainer.innerHTML = '';

  // カテゴリごとにタスクをグループ分けして描画
  CATEGORIES.forEach(category => {
    const categoryTasks = period.tasks.filter(t => t.categoryId === category.id);
    
    // グループヘッダーの作成
    const groupHeader = document.createElement('div');
    groupHeader.className = 'category-group-header';
    groupHeader.innerText = category.name;
    checklistContainer.appendChild(groupHeader);

    // そのカテゴリにタスクがない場合の表示
    if (categoryTasks.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'category-empty-msg';
      emptyMsg.innerText = 'この工程のチェック項目はありません。';
      checklistContainer.appendChild(emptyMsg);
      return;
    }

    // タスクの描画
    categoryTasks.forEach(task => {
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

  // テンプレートタスクをコピーして新規期間を追加
  const newPeriod = {
    id: Date.now(),
    startDate: startDate,
    endDate: endDate,
    tasks: DEFAULT_TASKS_TEMPLATE.map((t, idx) => ({
      id: Date.now() + idx + 100,
      categoryId: t.categoryId,
      text: t.text,
      checked: false
    }))
  };

  state.periods.push(newPeriod);
  saveData();
  render();
  showToast('4週間の勤務期間を追加しました！');
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
function addTask(periodId, text, categoryId) {
  if (!text.trim()) {
    showToast('作業項目を入力してください。');
    return;
  }

  const period = state.periods.find(p => p.id === periodId);
  if (period) {
    const newTask = {
      id: Date.now(),
      categoryId: parseInt(categoryId, 10),
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
    const categorySelect = document.getElementById('taskCategorySelect');
    addTask(state.activePeriodId, taskInput.value, categorySelect.value);
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
