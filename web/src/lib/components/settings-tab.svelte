<script lang="ts">
	import { app } from '#lib/app-state.svelte.js';
	import { periodText, shortDateTime } from '#lib/format.js';
	import PublicRefSelect from './public-ref-select.svelte';
	import SheetLinkPanel from './sheet-link-panel.svelte';

	let me = $derived(app.members.find((m) => m.user_id === app.myId));
	let myName = $state('');
	let newCategory = $state('');
	let inviteEmail = $state('');
	let fetching = $state(false);
	let th = $state({ alert_days: 30, price_alert_pct: 10, gap_alert_pts: 5 });
	let notify = $state({ notify_enabled: false, public_notify: true });

	// データが読み込まれたら入力欄に反映する
	$effect(() => {
		myName = me?.display_name ?? '';
	});
	$effect(() => {
		const h = app.household;
		if (!h) return;
		th = { alert_days: h.alert_days, price_alert_pct: h.price_alert_pct, gap_alert_pts: h.gap_alert_pts };
		notify = { notify_enabled: h.notify_enabled, public_notify: h.public_notify };
	});

	const done = (msg: string) => () => app.toast(msg);
	const ignore = () => undefined;

	function saveName(e: SubmitEvent) {
		e.preventDefault();
		app.setDisplayName(myName).then(done('表示名を保存しました。'), ignore);
	}

	function addCategory(e: SubmitEvent) {
		e.preventDefault();
		const name = newCategory.trim();
		if (!name) return;
		app.addCategory(name).then(() => {
			newCategory = '';
			app.toast(`「${name}」を追加しました。`);
		}, ignore);
	}

	async function deleteCategory(id: string, name: string) {
		const used = app.items.filter((i) => i.category_id === id).length;
		if (used) return app.toast(`このカテゴリの資材が${used}件あります。先に別のカテゴリへ変更してください。`, true);
		if (app.categories.length <= 1) return app.toast('カテゴリは最低1つ必要です。', true);
		if (await app.confirm(`カテゴリ「${name}」を削除しますか？`, '削除する')) app.deleteCategory(id).then(done('削除しました。'), ignore);
	}

	function invite(e: SubmitEvent) {
		e.preventDefault();
		const email = inviteEmail.trim();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return app.toast('メールアドレスを正しく入力してください。', true);
		app.invite(email).then(() => {
			inviteEmail = '';
			app.toast('招待しました。相手にアプリのURLを伝えて、このメールアドレスでログインしてもらってください。');
		}, ignore);
	}

	async function removeMember(userId: string, name: string) {
		if (await app.confirm(`${name}さんを農園から外しますか？\n外すとアプリのデータを見られなくなります。`, '外す')) {
			app.removeMember(userId).then(done('外しました。'), ignore);
		}
	}

	async function fetchPublic() {
		fetching = true;
		try {
			const res = await app.refreshPublic();
			app.toast(res.message, !res.ok);
		} catch {
			// お知らせ済み
		} finally {
			fetching = false;
		}
	}

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(location.origin);
			app.toast('URLをコピーしました。');
		} catch {
			app.toast(location.origin);
		}
	}
</script>

<div class="panel">
	<h2>あなたの表示名</h2>
	<p class="note">ログイン中：{app.session?.user.email}{app.isOwner ? '（農園の所有者）' : ''}</p>
	<form class="row-form" onsubmit={saveName}>
		<input bind:value={myName} maxlength="20" placeholder="例：たろう" aria-label="表示名" />
		<button type="submit" class="btn btn-primary">保存</button>
	</form>
</div>

<div class="panel">
	<h2>家族との共有</h2>
	<p class="note">家族のメールアドレスを招待し、アプリのURLを伝えてください。そのメールアドレスでログインすると、この農園に参加できます。</p>
	<ul class="member-list">
		{#each app.members as m (m.user_id)}
			<li>
				<span><b>{m.display_name || m.email.split('@')[0]}</b> <span class="chg-sub">{m.email}</span></span>
				{#if m.role === 'owner'}<span class="badge">所有者</span>
				{:else if app.isOwner}<button type="button" class="btn btn-small btn-danger" onclick={() => removeMember(m.user_id, m.display_name || m.email)}>外す</button>{/if}
			</li>
		{/each}
		{#each app.invites as i (i.email)}
			<li>
				<span>{i.email} <span class="badge badge-warn">招待中</span></span>
				<button type="button" class="btn btn-small" onclick={() => app.cancelInvite(i.email).then(done('招待を取り消しました。'), ignore)}>取消</button>
			</li>
		{/each}
	</ul>
	{#if app.isOwner}
		<form class="row-form" onsubmit={invite}>
			<input type="email" bind:value={inviteEmail} placeholder="家族のメールアドレス" aria-label="招待するメールアドレス" />
			<button type="submit" class="btn btn-primary">招待</button>
		</form>
	{:else}
		<p class="note">家族を招待できるのは、農園の所有者だけです。</p>
	{/if}
	<div class="row-form" style="margin-top:8px">
		<input value={typeof location === 'undefined' ? '' : location.origin} readonly aria-label="アプリのURL" />
		<button type="button" class="btn" onclick={copyUrl}>URLをコピー</button>
	</div>
</div>

<div class="panel">
	<h2>カテゴリ</h2>
	<p class="note">並び順は、入力欄の選択肢や一覧の並びに反映されます。「比べる全国データ」は、価格の変動を全国と比べるときに使います。</p>
	{#each app.categories as c, i (c.id)}
		<div class="cat-row">
			<div class="cat-order">
				<button type="button" aria-label="上へ" disabled={i === 0} onclick={() => app.moveCategory(c.id, -1).catch(ignore)}>▲</button>
				<button type="button" aria-label="下へ" disabled={i === app.categories.length - 1} onclick={() => app.moveCategory(c.id, 1).catch(ignore)}>▼</button>
			</div>
			<div class="cat-main">
				<span class="cat-name">{c.name} <span class="chg-sub">{app.items.filter((x) => x.category_id === c.id).length}品目</span></span>
				<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'rename-category', id: c.id })}>名前の変更</button>
				{#if app.categories.length > 1}<button type="button" class="btn btn-small" onclick={() => (app.modal = { kind: 'merge-category', id: c.id })}>まとめる</button>{/if}
				<button type="button" class="btn btn-small btn-danger" onclick={() => deleteCategory(c.id, c.name)}>削除</button>
			</div>
			<label class="cat-public">
				<span class="chg-sub">比べる全国データ</span>
				<PublicRefSelect value={c.public_ref} onchange={(v) => app.setCategoryPublic(c.id, v).then(done('保存しました。'), ignore)} />
			</label>
		</div>
	{/each}
	<form class="row-form" style="margin-top:10px" onsubmit={addCategory}>
		<input bind:value={newCategory} maxlength="30" placeholder="新しいカテゴリ名" aria-label="新しいカテゴリ名" />
		<button type="submit" class="btn btn-primary">追加</button>
	</form>
</div>

<div class="panel">
	<h2>注意表示</h2>
	<form class="settings-grid" onsubmit={(e) => { e.preventDefault(); app.saveHousehold(th).then(done('保存しました。'), ignore); }}>
		<label>期限間近とする日数<input type="number" min="1" max="365" bind:value={th.alert_days} inputmode="numeric" /></label>
		<label>値上がり注意（前年比％以上）<input type="number" min="0" step="any" bind:value={th.price_alert_pct} inputmode="decimal" /></label>
		<label>全国より高め（差がポイント以上）<input type="number" min="0" step="any" bind:value={th.gap_alert_pts} inputmode="decimal" /></label>
		<button type="submit" class="btn btn-primary">保存</button>
	</form>
</div>

<div class="panel">
	<h2>メール通知</h2>
	<p class="note">{app.isOwner ? 'メールは農園の家族全員に届きます。毎朝7時ごろに送ります。' : 'メール通知を変更できるのは、農園の所有者だけです。'}</p>
	<form class="settings-grid" onsubmit={(e) => { e.preventDefault(); app.saveHousehold(notify).then(done('保存しました。'), ignore); }}>
		<label class="check"><input type="checkbox" bind:checked={notify.notify_enabled} disabled={!app.isOwner} /> 注意が必要な資材（発注・使用期限）を毎朝メールで知らせる</label>
		<label class="check"><input type="checkbox" bind:checked={notify.public_notify} disabled={!app.isOwner} /> 全国データが新しくなったらメールで知らせる</label>
		<button type="submit" class="btn btn-primary" disabled={!app.isOwner}>保存</button>
	</form>
</div>

<div class="panel">
	<h2>全国データ（農業物価統計調査）</h2>
	<dl class="status-list">
		<dt>最終取得</dt><dd>{app.status?.public_last_fetch ? shortDateTime(app.status.public_last_fetch) : 'まだ取得していません'}</dd>
		<dt>結果</dt><dd>{app.status?.public_last_status || '—'}</dd>
		<dt>最新のデータ</dt><dd>{app.status?.public_latest_period ? `${periodText(app.status.public_latest_period)}分` : '—'}</dd>
		<dt>系列の数</dt><dd>価格指数 {app.publicSeries.filter((s) => s.kind === 'idx').length}・品目別価格 {app.publicSeries.filter((s) => s.kind === 'item').length}</dd>
	</dl>
	<button type="button" class="btn" disabled={fetching} onclick={fetchPublic}>{fetching ? '取得中…（30秒ほどかかります）' : '今すぐ取得'}</button>
	<p class="note">毎月1日と15日に自動で取得します。出典：農林水産省「農業物価統計調査」。最新の値は速報値（概数値）で、あとで確定値に置き換わります。</p>
</div>

<SheetLinkPanel />

<div class="panel">
	<h2>アカウント</h2>
	{#if app.memberships.length > 1}
		<label class="inline">農園を切り替える
			<select value={app.householdId} onchange={(e) => app.openHousehold((e.currentTarget as HTMLSelectElement).value)}>
				{#each app.memberships as m (m.household_id)}<option value={m.household_id}>{m.households?.name ?? m.household_id}</option>{/each}
			</select>
		</label>
	{/if}
	<div class="form-actions"><button type="button" class="btn" onclick={() => app.signOut()}>ログアウト</button></div>
</div>
