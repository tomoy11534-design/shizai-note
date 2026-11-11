<script lang="ts">
	// 「AIに聞く」の使い方（押すと開く短い説明）
</script>

<details class="ai-help">
	<summary>
		<span class="ai-help-icon" aria-hidden="true">💡</span>
		<span class="ai-help-title">「AIに聞く」の使い方（無料）</span>
		<span class="ai-help-hint" aria-hidden="true"></span>
	</summary>
	<div class="ai-help-body">
		<p>辞書（特徴・使い方・注意点・対象の作物）を、ChatGPT・Gemini・Claude などのAIアプリに下書きしてもらえます。料金はかかりません。</p>
		<ol>
			<li>調べたい資材の <b>AIに聞く</b> を押す（質問文が自動でコピーされます）</li>
			<li><b>ChatGPTを開く</b> などのボタンでAIアプリを開く</li>
			<li>入力欄を長押しして <b>貼り付け</b>、そのまま送る</li>
			<li>AIの答えを全部コピーする（答えの下のコピーのマークが便利です）</li>
			<li>資材ノートに戻り、②の欄に貼り付けて <b>答えを読み取る</b> を押す</li>
			<li>内容を確かめて、登録する欄にチェックを入れて <b>登録する</b> を押す</li>
		</ol>
		<p class="ai-help-warn">AIはまちがえることがあります。とくに農薬の倍率・使用時期・回数は、必ずラベルか農薬登録情報で確かめてください。</p>
	</div>
</details>

<style>
	/* 目立つよう、うすい緑の背景と左の太い線で囲む */
	.ai-help {
		background: var(--brand-soft);
		border: 1px solid var(--brand);
		border-left-width: 5px;
		border-radius: 8px;
		margin: 0 0 10px;
		font-size: 0.88rem;
	}
	.ai-help summary {
		list-style: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		min-height: 44px;
		box-sizing: border-box;
	}
	.ai-help summary::-webkit-details-marker { display: none; }
	.ai-help-icon { font-size: 1.1rem; flex: none; }
	.ai-help-title { font-weight: bold; color: var(--brand-dark); font-size: 0.95rem; }
	/* 右側に「開く／閉じる」を出して、押せることが分かるようにする */
	.ai-help-hint {
		margin-left: auto;
		flex: none;
		font-size: 0.78rem;
		font-weight: bold;
		color: var(--card);
		background: var(--brand);
		border-radius: 999px;
		padding: 2px 10px;
	}
	.ai-help-hint::after { content: 'タップで開く ▼'; }
	.ai-help[open] .ai-help-hint::after { content: '閉じる ▲'; }
	.ai-help-body { padding: 0 12px 10px; }
	.ai-help p { margin: 6px 0; }
	.ai-help ol { margin: 6px 0; padding-left: 1.4em; display: grid; gap: 4px; }
	.ai-help-warn { color: var(--muted); font-size: 0.82rem; }
</style>
