let rosbridgeModule = await import(`${base_url}/js/modules/rosbridge.js`);
let persistentModule = await import(`${base_url}/js/modules/persistent.js`);
let utilModule = await import(`${base_url}/js/modules/util.js`);
let StatusModule = await import(`${base_url}/js/modules/status.js`);
let pathsModule = await import(`${base_url}/assets/btn/paths`);


let rosbridge = rosbridgeModule.rosbridge;
let settings = persistentModule.settings;
let imageToDataURL = utilModule.imageToDataURL;
let Status = StatusModule.Status;
let paths = pathsModule.default;

let models = {};
paths.map(file => {
	const name = file.split('.svg')[0].split("_")[1];
	models[name] = new Image();
	models[name].src = `${base_url}/assets/btn/${file}`;
});


let topic = getTopic("{uniqueID}");
let status = new Status(
	document.getElementById("{uniqueID}_icon"),
	document.getElementById("{uniqueID}_status")
);

let button_offset_x = "50%";
let button_offset_y = "85%";
let sprite = "none";

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const vwToVh = vw => (vw * window.innerWidth) / window.innerHeight;

let typedict = {};

//persistent loading, so we don't re-fetch on every update
let icons = {};
icons["true"] = await imageToDataURL("assets/button_true.svg");
icons["false"] = await imageToDataURL("assets/button_false.svg");
icons["default"] = await imageToDataURL("assets/button.svg");

const selectionbox = document.getElementById("{uniqueID}_topic");
const icondiv = document.getElementById("{uniqueID}_icon");
const icon = icondiv.getElementsByTagName('img')[0];
const icontext = icondiv.getElementsByTagName('p')[0];
const namebox = document.getElementById("{uniqueID}_name");

const sizeSlider = document.getElementById('{uniqueID}_size');
const sizeValue = document.getElementById('{uniqueID}_size_value');
const spriteSelector = document.getElementById('{uniqueID}_sprite');
const previewImg = document.getElementById("{uniqueID}_previewimg");


const buttonContainer = document.getElementById("{uniqueID}_button");
const buttonImg = buttonContainer.getElementsByTagName("img")[0];
const buttonIcon = buttonContainer.getElementsByTagName("img")[1];

// const buttonText = buttonContainer.getElementsByTagName("p")[0];
const buttonpreview = document.getElementById('{uniqueID}_buttonpreview');

sizeSlider.addEventListener('input', () =>  {
	sizeValue.textContent = sizeSlider.value;
	saveSettings();
});


namebox.addEventListener('input', function() {
	icontext.textContent = namebox.value;
	// buttonText.textContent = namebox.value;
	saveSettings();
});


spriteSelector.addEventListener("change", (event) => {
	sprite = spriteSelector.value;
	previewImg.src = models[sprite].src;
	buttonIcon.src = models[sprite].src;
	saveSettings();
});

//Settings
if(settings.hasOwnProperty("{uniqueID}")){
	const loaded_data  = settings["{uniqueID}"];
	topic = loaded_data.topic;
	namebox.value = loaded_data.text;
	icontext.textContent = loaded_data.text;
	// buttonText.textContent = loaded_data.text;
	sizeSlider.value = loaded_data.size;
	sizeValue.textContent = loaded_data.size;
	typedict = loaded_data.typedict ?? {};
	button_offset_x = loaded_data.offset_x;
	button_offset_y = loaded_data.offset_y;
	sprite = loaded_data.sprite ?? "none";
	spriteSelector.value = sprite;
	previewImg.src = models[sprite].src;
	buttonIcon.src = models[sprite].src;

}else{
	saveSettings();
}

function saveSettings(){
	settings["{uniqueID}"] = {
		topic: topic,
		text: namebox.value,
		size: sizeSlider.value,
		offset_x: button_offset_x,
		offset_y: button_offset_y,
		typedict: typedict,
		sprite: sprite,
	}
	settings.save();

	displayButtonImageOffset(button_offset_x, button_offset_y);
	displaySpriteList();
}

//Messaging
function sendMessage(){

	buttonContainer.classList.add("button-press-effect");

	setTimeout(() => {
		buttonContainer.classList.remove("button-press-effect");
	}, 200);

	if(typedict[topic] == "std_msgs/msg/Bool" || typedict[topic] == "std_msgs/msg/Empty"){
		const publisher = new ROSLIB.Topic({
			ros: rosbridge.ros,
			name: topic,
			messageType: typedict[topic],
			throttle_rate: 33
		});

		if(typedict[topic] == "std_msgs/msg/Bool"){
			publisher.publish(new ROSLIB.Message({
				data: !value,
			}));
		}else{
			publisher.publish(new ROSLIB.Message({}));
		}
	}
	else if(typedict[topic] == "std_srvs/srv/Empty"){
		const service = new ROSLIB.Service({
			ros: rosbridge.ros,
			name: topic,
			serviceType: "std_srvs/srv/Empty"
		});
		const request = new ROSLIB.ServiceRequest({});
		service.callService(request, (result) => {});
	}
	else if(typedict[topic] == "std_srvs/srv/Trigger"){
		const service = new ROSLIB.Service({
			ros: rosbridge.ros,
			name: topic,
			serviceType: "std_srvs/srv/Trigger"
		});
		const request = new ROSLIB.ServiceRequest({});
		service.callService(request, (result) => {
			if(result.success){
				status.setOK(result.message);
			}else{
				status.setError(result.message);
			}
			
			//flash result state
			icon.src = icons[result.success];
			setTimeout(()=>{
				icon.src = icons["default"];
			}, 500);
		});
	}
	else if(typedict[topic] == "std_srvs/srv/SetBool"){
		const service = new ROSLIB.Service({
			ros: rosbridge.ros,
			name: topic,
			serviceType: "std_srvs/srv/SetBool"
		});
		const request = new ROSLIB.ServiceRequest({
			data: !value  // toggle the value
		});
		service.callService(request, (result) => {
			if(result.success){
				value = !value;
				icon.src = icons[value];
				status.setOK(result.message);
			}else{
				status.setError(result.message);
			}
		});
	}

}

let value = false;
let listener = undefined;
let booltopic = undefined;

function connect(){

	if(topic == ""){
		status.setError("Empty topic/service.");
		return;
	}

	if(booltopic !== undefined){
		booltopic.unsubscribe(listener);
	}

	if(typedict[topic] == "std_msgs/msg/Bool"){

		status.setWarn("No data received.");

		booltopic = new ROSLIB.Topic({
			ros : rosbridge.ros,
			name : topic,
			messageType : "std_msgs/msg/Bool",
			throttle_rate: 33
		});	
		
		listener = booltopic.subscribe((msg) => {
			value = msg.data;
			icon.src = icons[value];
			status.setOK();
		});

		icon.src = icons["false"];
	}
	else if(typedict[topic] == "std_srvs/srv/SetBool"){
		icon.src = icons["false"];
	}	
	else{
		icon.src = icons["default"];
	}

	saveSettings();
}

async function loadTopics(){
	let booltopics = await rosbridge.get_topics("std_msgs/msg/Bool");
	let emptypubs = await rosbridge.get_topics("std_msgs/msg/Empty");
	let emptysrvs = await rosbridge.get_services("std_srvs/srv/Empty");
	let triggersrvs = await rosbridge.get_services("std_srvs/srv/Trigger");
	let setboolsrvs = await rosbridge.get_services("std_srvs/srv/SetBool");

	let topiclist = "";

	booltopics.forEach(element => {
		topiclist += "<option value='"+element+"'>"+element+" (msgs/Bool)</option>";
		typedict[element] = "std_msgs/msg/Bool";
	});

	emptypubs.forEach(element => {
		topiclist += "<option value='"+element+"'>"+element+" (msgs/Empty)</option>";
		typedict[element] = "std_msgs/msg/Empty";
	});

	emptysrvs.forEach(element => {
		if(!element.includes("/vizanti/")){
			topiclist += "<option value='"+element+"'>"+element+" (srvs/Empty)</option>";
			typedict[element] = "std_srvs/srv/Empty";
		}
	});

	triggersrvs.forEach(element => {
		if(!element.includes("/vizanti/")){
			topiclist += "<option value='"+element+"'>"+element+" (srvs/Trigger)</option>";
			typedict[element] = "std_srvs/srv/Trigger";
		}
	});

	setboolsrvs.forEach(element => {
		if(!element.includes("/vizanti/")){
			topiclist += "<option value='"+element+"'>"+element+" (srvs/SetBool)</option>";
			typedict[element] = "std_srvs/srv/SetBool";
		}
	});

	selectionbox.innerHTML = topiclist;

	if(topic == "")
		topic = selectionbox.value;
	else{
		if(typedict.hasOwnProperty(topic)){
			selectionbox.value = topic;
		}else{
			topiclist += "<option value='"+topic+"'>"+topic+"</option>";
			selectionbox.innerHTML = topiclist;
			selectionbox.value = topic;
		}
	}

}

selectionbox.addEventListener("change", (event) => {
	topic = selectionbox.value;
	icon.src = icons["default"];
	connect();
});

selectionbox.addEventListener("click", connect);
icon.addEventListener("click", loadTopics);

loadTopics();
connect();

function displaySpriteList() {
	let spritelist = "";
	for (const [key, value] of Object.entries(models)) {
		spritelist += "<option value='"+key+"'>"+key+"</option>"
	}
	spriteSelector.innerHTML = spritelist;
	spriteSelector.value = sprite;
}

function displayButtonImageOffset(x, y) {
	if (!buttonImg.complete) return; // Wait until image is fully loaded

	const size = parseFloat(sizeSlider.value); // percent of screen width

	buttonContainer.style.width = `${size}vw`;
	buttonContainer.style.height = `${size}vw`;
	buttonImg.style.width = `${size}vw`;
	buttonImg.style.height = `${size}vw`;

	let offset_x = clamp(parseFloat(x), size/2, 100 - size/2);
	let offset_y = clamp(parseFloat(y), size/2, 100 - size/2);

	buttonContainer.style.position = "absolute";
	buttonContainer.style.left = `${offset_x}%`;
	buttonContainer.style.top = `${offset_y}%`;
	buttonContainer.style.transform = "translate(-50%, -50%)";

	buttonpreview.style.left = `calc(${offset_x}% - 50px)`;
	buttonpreview.style.top = `calc(${offset_y}% - 50px)`;

}

buttonContainer.addEventListener("click", (event) =>{
		sendMessage();
});

//preview for moving around

let preview_active = false;

function onStart(event) {
	preview_active = true;
	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup', onEnd);
	document.addEventListener('touchmove', onMove);
	document.addEventListener('touchend', onEnd);
}

function onMove(event) {
	if (preview_active) {
		event.preventDefault();
		let currentX, currentY;

		if (event.type === "touchmove") {
			currentX = event.touches[0].clientX;
			currentY = event.touches[0].clientY;
		} else {
			currentX = event.clientX;
			currentY = event.clientY;
		}

		button_offset_x = (currentX/window.innerWidth * 100) +"%";
		button_offset_y = (currentY/window.innerHeight * 100) +"%";
		saveSettings();

	}
}

function onEnd() {
	preview_active = false;
	document.removeEventListener('mousemove', onMove);
	document.removeEventListener('mouseup', onEnd);
	document.removeEventListener('touchmove', onMove);
	document.removeEventListener('touchend', onEnd);
}
  
buttonpreview.addEventListener('mousedown', onStart);
buttonpreview.addEventListener('touchstart', onStart);

displayButtonImageOffset(button_offset_x, button_offset_y);
displaySpriteList();

console.log("Button Widget Loaded {uniqueID}")