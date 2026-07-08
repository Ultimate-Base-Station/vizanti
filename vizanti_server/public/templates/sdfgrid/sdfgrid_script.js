let viewModule = await import(`${base_url}/js/modules/view.js`);
let tfModule = await import(`${base_url}/js/modules/tf.js`);
let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);

let view = viewModule.view;
let tf = tfModule.tf;
let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let Status = StatusModule.Status;

let topic = getTopic("{uniqueID}");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let listener = undefined;
let sdfTopic = undefined;
let sdfData = undefined;
let newSdfData = undefined;
let receivedMsg = undefined;
let renderedNormalization = undefined;

const tempCanvas = document.createElement('canvas');
const workerCanvas = document.createElement('canvas');
const workerThread = new Worker(`${base_url}/templates/sdfgrid/sdfgrid_worker.js`);
const offscreenCanvas = workerCanvas.transferControlToOffscreen();
workerThread.postMessage({ canvas: offscreenCanvas }, [offscreenCanvas]);

const selectionbox = document.getElementById("{uniqueID}_topic");
const opacitySlider = document.getElementById('{uniqueID}_opacity');
const opacityValue = document.getElementById('{uniqueID}_opacity_value');
const normalizationMode = document.getElementById('{uniqueID}_normalization_mode');
const manualNormalization = document.getElementById('{uniqueID}_manual_normalization');
const timestampCheckbox = document.getElementById('{uniqueID}_use_timestamp');
const throttle = document.getElementById('{uniqueID}_throttle');

const canvas = document.getElementById('{uniqueID}_canvas');
const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

opacitySlider.addEventListener('input', () => {
	opacityValue.textContent = opacitySlider.value;
	saveSettings();
	drawSdf();
});

normalizationMode.addEventListener('change', () => {
	saveSettings();
	queueWorkerMsg(receivedMsg);
});

manualNormalization.addEventListener('input', () => {
	saveSettings();
	if (normalizationMode.value == "manual") {
		queueWorkerMsg(receivedMsg);
	}
});

timestampCheckbox.addEventListener('change', () => {
	saveSettings();
	drawSdf();
});

throttle.addEventListener("input", () => {
	saveSettings();
	connect();
});

if (settings.hasOwnProperty("{uniqueID}")) {
	const loadedData = settings["{uniqueID}"];
	topic = loadedData.topic;
	opacitySlider.value = loadedData.opacity ?? 0.85;
	opacityValue.textContent = opacitySlider.value;
	normalizationMode.value = loadedData.normalization_mode ?? "message";
	manualNormalization.value = loadedData.manual_normalization ?? 5.0;
	timestampCheckbox.checked = loadedData.use_timestamp ?? false;
	throttle.value = loadedData.throttle ?? 200;
} else {
	saveSettings();
}

function saveSettings() {
	settings["{uniqueID}"] = {
		topic: topic,
		opacity: opacitySlider.value,
		normalization_mode: normalizationMode.value,
		manual_normalization: manualNormalization.value,
		throttle: throttle.value,
		use_timestamp: timestampCheckbox.checked,
	};
	settings.save();
}

function autoNormalization(msg) {
	const widthMeters = msg.info.width * msg.info.resolution;
	const heightMeters = msg.info.height * msg.info.resolution;
	return Math.max(0.5 * Math.min(widthMeters, heightMeters), 1.0e-6);
}

function messageNormalization(msg) {
	if (Number.isFinite(msg.max_abs_sdf) && msg.max_abs_sdf > 0.0) {
		return msg.max_abs_sdf;
	}
	return autoNormalization(msg);
}

function selectedNormalization(msg) {
	if (!msg) {
		return 1.0;
	}

	if (normalizationMode.value == "manual") {
		return Math.max(parseFloat(manualNormalization.value), 1.0e-6);
	}

	if (normalizationMode.value == "auto") {
		return autoNormalization(msg);
	}

	return messageNormalization(msg);
}

async function drawSdf() {
	if (!sdfData) {
		return;
	}

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;

	if (opacitySlider.value == 0.0) {
		return;
	}

	const msg = sdfData.msg;
	const mapWidth = view.getMapUnitsInPixels(tempCanvas.width * msg.info.resolution);
	const mapHeight = view.getMapUnitsInPixels(tempCanvas.height * msg.info.resolution);

	let tfPose = sdfData.pose;
	if (!timestampCheckbox.checked) {
		tfPose = tf.transformPose(
			msg.header.frame_id,
			tf.fixed_frame,
			msg.info.origin.position,
			msg.info.origin.orientation
		);
	}

	if (!tfPose) {
		return;
	}

	const pos = view.fixedToScreen({
		x: tfPose.translation.x,
		y: tfPose.translation.y,
	});

	const matrix = view.quaterionToProjectionMatrix(tfPose.rotation);
	ctx.globalAlpha = opacitySlider.value;
	ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], pos.x, pos.y);
	ctx.scale(1.0, -1.0);
	ctx.drawImage(tempCanvas, 0, 0, mapWidth, mapHeight);
}

function connect() {
	if (topic == "") {
		status.setError("Empty topic.");
		return;
	}

	if (sdfTopic !== undefined) {
		sdfTopic.unsubscribe(listener);
	}

	sdfTopic = new ROSLIB.Topic({
		ros: rosbridge.ros,
		name: topic,
		messageType: 'gp_sdf_interfaces/msg/SdfGrid',
		throttle_rate: parseInt(throttle.value),
		compression: rosbridge.compression,
	});

	status.setWarn("No data received.");

	workerThread.onmessage = (event) => {
		setTimeout(() => {
			const img = event.data.image;
			tempCanvas.width = img.width;
			tempCanvas.height = img.height;
			tempCanvas.getContext('2d', { colorSpace: 'srgb' }).putImageData(img, 0, 0);
			renderedNormalization = event.data.normalization;
			sdfData = newSdfData;
			drawSdf();
			status.setOK(`${sdfData.msg.info.width} x ${sdfData.msg.info.height}, norm ${renderedNormalization.toFixed(3)} m`);
		}, 12);
	};

	listener = sdfTopic.subscribe((msg) => {
		const expectedSize = msg.info.width * msg.info.height;
		if (expectedSize == 0 || msg.values.length != expectedSize) {
			status.setWarn("Invalid SDF grid dimensions or values length.");
			return;
		}

		if (msg.header.frame_id == "") {
			status.setWarn("Transform frame is an empty string, falling back to fixed frame.");
			msg.header.frame_id = tf.fixed_frame;
		}

		if (!tf.absoluteTransforms[msg.header.frame_id]) {
			status.setError("Required transform frame \"" + msg.header.frame_id + "\" not found.");
			return;
		}

		queueWorkerMsg(msg);
		receivedMsg = msg;
	});

	saveSettings();
}

function queueWorkerMsg(msg) {
	if (!msg) {
		return;
	}

	msg.pose = tf.transformPose(
		msg.header.frame_id,
		tf.fixed_frame,
		msg.info.origin.position,
		msg.info.origin.orientation
	);

	newSdfData = { msg: msg, pose: msg.pose };
	sdfData = undefined;

	workerThread.postMessage({
		sdf_msg: msg,
		normalization: selectedNormalization(msg),
	});
}

async function loadTopics() {
	let result = await rosbridge.get_topics("gp_sdf_interfaces/msg/SdfGrid");

	let topiclist = "";
	result.forEach(element => {
		topiclist += "<option value='" + element + "'>" + element + "</option>";
	});
	selectionbox.innerHTML = topiclist;

	if (topic == "") {
		topic = selectionbox.value;
	} else if (result.includes(topic)) {
		selectionbox.value = topic;
	} else {
		topiclist += "<option value='" + topic + "'>" + topic + "</option>";
		selectionbox.innerHTML = topiclist;
		selectionbox.value = topic;
	}

	connect();
}

selectionbox.addEventListener("change", () => {
	topic = selectionbox.value;
	sdfData = undefined;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
	connect();
});

selectionbox.addEventListener("click", connect);
document.getElementById("{uniqueID}_icon").addEventListener("click", loadTopics);

function resizeScreen() {
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;
	drawSdf();
}

window.addEventListener("tf_fixed_frame_changed", drawSdf);
window.addEventListener("tf_changed", () => {
	if (receivedMsg && receivedMsg.header.frame_id != tf.fixed_frame) {
		drawSdf();
	}
});
window.addEventListener("view_changed", drawSdf);
window.addEventListener('resize', resizeScreen);
window.addEventListener('orientationchange', resizeScreen);

loadTopics();
resizeScreen();

console.log("SDF Grid Widget Loaded {uniqueID}");
