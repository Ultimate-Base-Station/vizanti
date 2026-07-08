let canvas = undefined;

const STOPS = [
	{ position: 0.0, r: 176, g: 0, b: 0 },
	{ position: 0.25, r: 255, g: 77, b: 77 },
	{ position: 0.5, r: 255, g: 255, b: 255 },
	{ position: 0.75, r: 77, g: 255, b: 77 },
	{ position: 1.0, r: 0, g: 128, b: 0 },
];

function clamp(value, minValue, maxValue) {
	return Math.min(Math.max(value, minValue), maxValue);
}

function interpolateColor(value, normalization) {
	const t = clamp(0.5 + 0.5 * value / normalization, 0.0, 1.0);

	for (let i = 1; i < STOPS.length; i++) {
		if (t <= STOPS[i].position) {
			const lo = STOPS[i - 1];
			const hi = STOPS[i];
			const span = Math.max(hi.position - lo.position, 1.0e-6);
			const localT = (t - lo.position) / span;
			return {
				r: Math.round(lo.r + (hi.r - lo.r) * localT),
				g: Math.round(lo.g + (hi.g - lo.g) * localT),
				b: Math.round(lo.b + (hi.b - lo.b) * localT),
			};
		}
	}

	return STOPS[STOPS.length - 1];
}

self.addEventListener('message', function(event) {
	if (event.data.canvas) {
		canvas = event.data.canvas;
		return;
	}

	const msg = event.data.sdf_msg;
	const normalization = Math.max(event.data.normalization, 1.0e-6);
	const width = msg.info.width;
	const height = msg.info.height;

	canvas.width = width;
	canvas.height = height;

	const sdfctx = canvas.getContext('2d', { colorSpace: 'srgb' });
	const image = sdfctx.createImageData(width, height);
	const values = msg.values;

	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		const out = i * 4;

		if (!Number.isFinite(value)) {
			image.data[out] = 0;
			image.data[out + 1] = 0;
			image.data[out + 2] = 0;
			image.data[out + 3] = 0;
			continue;
		}

		const color = interpolateColor(value, normalization);
		image.data[out] = color.r;
		image.data[out + 1] = color.g;
		image.data[out + 2] = color.b;
		image.data[out + 3] = 255;
	}

	self.postMessage({
		image: image,
		normalization: normalization,
	});
}, false);
