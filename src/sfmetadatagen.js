/**
 * When a folder style pull request is open, the plugin builds the corresponding 
 * package.xml and shows it on the page. You can copy/paste it for your target deplyments.
 */
// Selectors to reach the ButBucket content of the page
const fileListClassSelector = "iterable-item file";
const fileListContainerQuerySelector = "section[data-module='pullrequests/file-list']";
const pullRequestActionsContainerIdSelector = "pullrequest-actions";

// html classes to identify the status of the file.
const modifiedFileClass = "file-modified";
const addedFileClass = "file-added";
const renamedFileClass = "file-renamed";
const removedFileClass = "file-removed";

// Custom component identifiers
// show xml button
const showPackageBtnId = "pkgGenBtn";
const showPackageBtnTextOn = "Show xml";
const showPackageBtnTextOff = "Hide xml";
const showPackageBtnDecorationClass = "aui-button aui-button-primary";
// package xml box
const xmlBoxId = "pkgBox";
const tabText = "\u00A0\u00A0\u00A0\u00A0";
const doubleTab = tabText + tabText;
const xmlHeaderText = '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">';
var xmlBodyText = '';
var xmlFullContent;
const xmlFooterText = '\n' + tabText + '<version>47.0</version>\n</Package>';
var ignoredFiles = [];

// file type path identifiers
const auraFileFolderName = "aura";
const classFileFolderName = "classes";
const objectFileFolderName = "objects";
const fieldFileFolderName = "fields";
const lwcFileFolderName = "lwc";
const sourceCodeRootPath = "force-app/main/default/";
// Contains a "type to file list" in the form: [['classes', ['fflib_SObjectUnitOfWork','StringBuilder']], ...]
var fileNamesByType = new Map();

// package api names by the folder they are in [force-app/main/default/]FOLDER[/restOfFilePath]
const apiNameByPathFolderName = new Map([
	['classes', doubleTab + '<name>ApexClass</name>'],
	['aura', doubleTab + '<name>AuraDefinitionBundle</name>'],
	['lwc', doubleTab + '<name>LightningComponentBundle</name>'],
	['layouts', doubleTab + '<name>Layout</name>'],
	['triggers', doubleTab + '<name>ApexTrigger</name>'],
	['profiles', doubleTab + '<name>Profile</name>'],
	['webLinks', doubleTab + '<name>WebLink</name>'],
	['customMetadata', doubleTab + '<name>CustomMetadata</name>'],
	['listViews', doubleTab + '<name>ListView</name>'],
	['labels', doubleTab + '<name>CustomLabel</name>'],
	['tabs', doubleTab + '<name>CustomTab</name>'],
	['approvalProcesses', doubleTab + '<name>ApprovalProcess</name>'], // Special format force-app/main/default/approvalProcesses/objectName.approvalName.approvalProcess-meta.xml
	['objects', doubleTab + '<name>CustomObject</name>'],
	['fields', doubleTab + '<name>CustomField</name>'],
	['compactLayouts', doubleTab + '<name>??</name>'],
	['fieldSets', doubleTab + '<name>??</name>'],
	['recordTypes', doubleTab + '<name>??</name>'],
	['validationRules', doubleTab + '<name>??</name>'],
	['LeadConvertSettings', doubleTab + '<name>??</name>'],
	['applications', doubleTab + '<name>??</name>'],
	['assignmentRules', doubleTab + '<name>??</name>'],
	['authproviders', doubleTab + '<name>??</name>'],
	['autoResponseRules', doubleTab + '<name>??</name>'],
	['components', doubleTab + '<name>??</name>'],
	['duplicateRules', doubleTab + '<name>??</name>'],
	['email', doubleTab + '<name>??</name>'],
	['flexipages', doubleTab + '<name>??</name>'],
	['globalValueSets', doubleTab + '<name>??</name>'],
	['groups', doubleTab + '<name>??</name>'],
	['homePageLayouts', doubleTab + '<name>??</name>'],
	['matchingRules', doubleTab + '<name>??</name>'],
	['objectTranslations', doubleTab + '<name>??</name>'],
	['pages', doubleTab + '<name>??</name>'],
	['permissionsets', doubleTab + '<name>??</name>'],
	['postTemplates', doubleTab + '<name>??</name>'],
	['queues', doubleTab + '<name>??</name>'],
	['quickActions', doubleTab + '<name>??</name>'],
	['remoteSiteSettings', doubleTab + '<name>??</name>'],
	['roles', doubleTab + '<name>??</name>'],
	['settings', doubleTab + '<name>??</name>'],
	['standardValueSets', doubleTab + '<name>??</name>'],
	['topicsForObjects', doubleTab + '<name>??</name>'],
	['workflows', doubleTab + '<name>??</name>']
  ]);

function isModifiedFileClass(className) {
	return className.includes(modifiedFileClass);
}

function isAddedFileClass(className) {
	return className.includes(addedFileClass);
}

function isRenamedFileClass(className) {
	return className.includes(renamedFileClass);
}

function isRemovedFileClass(className) {
	return className.includes(removedFileClass);
}

function getFileListContainer() {
	return document.querySelector(fileListContainerQuerySelector);
}

function getPullRequestActionsContainer() {
	return document.getElementById(pullRequestActionsContainerIdSelector);
}

function toggleButtonText() {
	let btn = document.getElementById(showPackageBtnId);
	btn.innerText = (btn.innerText === showPackageBtnTextOn) ? showPackageBtnTextOff : showPackageBtnTextOn;
}

function isFieldFilePath(filePath) {
	return filePath.includes("/" + fieldFileFolderName + "/");
}

function isWebComponent(filePath) {
	return filePath.includes("/" + auraFileFolderName + "/") || filePath.includes("/" + lwcFileFolderName + "/");
}

function isSourceCode(filePath) {
	return filePath.includes(sourceCodeRootPath);
}

// The extension of the file is irrelevant for the package.xml
function getFileNameNoExtension(filePath) {
	let fieldName = filePath.substring(filePath.lastIndexOf("/") + 1, filePath.length -1);
	fieldName = fieldName.substring(0, fieldName.indexOf("."));
	return fieldName;
}

function getFileFolder(filePath) {
	let fileFolder = filePath.replace(sourceCodeRootPath, "");
	fileFolder = fileFolder.substring(fileFolder.indexOf("/") + 1, fileFolder.length);
	fileFolder = fileFolder.substring(0, fileFolder.indexOf("/"));
	return fileFolder;
}

function getFileType(filePath){
	let fileType = filePath.replace(sourceCodeRootPath, "");
	fileType = fileType.substring(0, fileType.indexOf("/"));
	return fileType;
}

function trackFile(fileId, fileType) {
	let files = fileNamesByType.get(fileType);
	if (!files) {
		fileNamesByType.set(fileType, [fileId]);
	} else if (!files.includes(fileId)) {
		files.push(fileId);
	}
}

function trackObjectChildFile(filePath) {
	let fileFolder = getFileFolder(filePath);
	let fileName = getFileNameNoExtension(filePath);
	let fileType = getFileType(filePath);

	trackFile(fileFolder + '.' + fileName, fileType);
}

function trackWebComponent(filePath) {
	let fileFolder = getFileFolder(filePath);
	let fileType = getFileType(filePath);

	trackFile(fileFolder, fileType);
}

function trackRegularFile(filePath) {
	let fileName = getFileNameNoExtension(filePath);
	let fileType = getFileType(filePath);

	trackFile(fileName, fileType);
}

function trackIgnoredFile(filePath) {
	ignoredFiles.push(filePath);
}

// TODO - Make filePath a member var and remove all the params.
function trackFileObject(filePath) {
	// In general, all the files follow a common path pattern excetp: 
	// - fields and workflow rules that needs two parts of path (object.field__c / object.workflow).
	// - aura and lwc that only need the folder where they nested on.
	// TODO this firs condition applies to all "object child" files.
	//debugger;
	if (isFieldFilePath(filePath)) {
		trackObjectChildFile(filePath);
	} else if (isWebComponent(filePath)){
		trackWebComponent(filePath);
	} else if (isSourceCode(filePath)) {
		trackRegularFile(filePath);
	} else {
		// ignore non source code files for package xml, but show them somehow to warn the user.
		trackIgnoredFile(filePath);
	}
}

function extractPullRequestChanges() {
	let fileItems = document.getElementsByClassName(fileListClassSelector);
	for (let i in fileItems) {
		if (fileItems[i].dataset) {
			// TODO for V2 - Skip processing if the repo is not an sfdx one.
			if (!isRemovedFileClass(fileItems[i].className)){
				trackFileObject(fileItems[i].dataset.fileIdentifier);
			}
		}
	}
}

function createTextWithChanges() {
	
	if (fileNamesByType.size === 0) {
		xmlFullContent = 'No sfdx changes found.';
		return;
	}

	for (let fileType of fileNamesByType.keys()) {
		xmlBodyText += "\n" + tabText + "<types>";
		for (let fileName of fileNamesByType.get(fileType)) {
			xmlBodyText += '\n' + doubleTab + '<members>' + fileName + '</members>'
		}
		xmlBodyText += '\n' + apiNameByPathFolderName.get(fileType);
		xmlBodyText += "\n" + tabText + "</types>";
	}

	xmlFullContent = xmlHeaderText + xmlBodyText + xmlFooterText;

	if (ignoredFiles.length > 0) {
		xmlFullContent += '\n\n WARNING! The following files were not added to the xml above:';
		for (let i in ignoredFiles) {
			xmlFullContent += '\n - ' + ignoredFiles[i];
		}
	}
}

function appendXmlBoxToPage() {
	let packageContainerText = document.createElement("p");
	packageContainerText.innerText = xmlFullContent;

	let packageContainer = document.createElement("div");
	packageContainer.setAttribute("id", xmlBoxId);
	packageContainer.appendChild(packageContainerText);

	let bitbucketFileListContainer = getFileListContainer();
	bitbucketFileListContainer.appendChild(packageContainer);
}

/**
 * Main function. This looks for the PR changes and formats it into package.xml style content
 * to finally add a block and display it in the page.
 */
function addPackageXmlContent() {
	extractPullRequestChanges();
	createTextWithChanges();
	appendXmlBoxToPage();
}

function togglePackageContent() {
	let xmlBox = document.getElementById(xmlBoxId);
	if (xmlBox) {
		if (xmlBox.className.indexOf("hiddenEl") > -1) {
			xmlBox.className = xmlBox.className.replace("hiddenEl", "");
		} else {
			xmlBox.className += " hiddenEl";
		}
	} else {
		addPackageXmlContent();
	}
}

function showPackageButtonHandler() {
	togglePackageContent();
	toggleButtonText();
}

function buildShowXmlBtn() {
	let showPackageBtn = document.createElement("button");
	showPackageBtn.className = showPackageBtnDecorationClass;
	showPackageBtn.setAttribute("role", "button");
	showPackageBtn.setAttribute("id", showPackageBtnId);
	showPackageBtn.innerText = showPackageBtnTextOn;
	showPackageBtn.addEventListener("click", showPackageButtonHandler);
	return showPackageBtn;
}

function addShowXmlButtonToPage() {
	let showPackageBtn = buildShowXmlBtn();
	getPullRequestActionsContainer().appendChild(showPackageBtn);
}

// Create the button and append it to the main actions section.
// Note that it has an event listener which will fire the package.xml calculation.
addShowXmlButtonToPage();