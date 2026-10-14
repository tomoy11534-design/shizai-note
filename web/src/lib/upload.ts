// 説明書ファイルの準備（大きな写真は縮小して容量を抑える）

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function shrinkImage(file: File): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			// 長い辺を2000pxまでにする
			const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(img.width * scale);
			canvas.height = Math.round(img.height * scale);
			canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
			URL.revokeObjectURL(url);
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('縮小に失敗しました。'))), 'image/jpeg', 0.85);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('画像を読み込めませんでした。'));
		};
		img.src = url;
	});
}

export async function prepareUpload(file: File): Promise<{ blob: Blob; name: string; type: string }> {
	let blob: Blob = file;
	let name = file.name || 'file';
	let type = file.type || (/\.pdf$/i.test(name) ? 'application/pdf' : '');
	if (/^image\/(jpeg|png|webp)$/.test(type) && file.size > 1.5 * 1024 * 1024) {
		try {
			const small = await shrinkImage(file);
			if (small.size < file.size) {
				blob = small;
				type = 'image/jpeg';
				name = name.replace(/\.[^.]+$/, '') + '.jpg';
			}
		} catch {
			// 縮小できなければ元のファイルのまま送る
		}
	}
	if (type !== 'application/pdf' && !type.startsWith('image/')) throw new Error(`「${name}」はPDFでも画像でもないため登録できません。`);
	if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`「${name}」は大きすぎます（20MBまで）。`);
	return { blob, name, type };
}
