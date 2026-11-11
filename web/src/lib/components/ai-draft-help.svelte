<script lang="ts">
	// 「AIに聞く」の使い方（押すと開く短い説明）
</script>

<details class="ai-help">
	<summary>「AIに聞く」の使い方（無料）</summary>
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
</details>

<style>
	.ai-help {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
		margin: 0 0 10px;
		font-size: 0.88rem;
	}
	.ai-help summary {
		cursor: pointer;
		font-weight: bold;
		color: var(--brand);
		padding: 4px 0;
	}
	.ai-help p { margin: 6px 0; }
	.ai-help ol { margin: 6px 0; padding-left: 1.4em; display: grid; gap: 4px; }
	.ai-help-warn { color: var(--muted); font-size: 0.82rem; }
</style>
