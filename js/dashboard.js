// ============================================================
// RBSK REFERRAL MANAGEMENT
// dashboard.js
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


// ============================================================
// FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// ============================================================
// CLOUDINARY
// ============================================================

const CLOUDINARY_CLOUD_NAME = "uwqzqwyv0";
const CLOUDINARY_UPLOAD_PRESET = "rbsk_upload";

const CLOUDINARY_UPLOAD_URL =
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;



const MAX_FILE_SIZE =
    10 * 1024 * 1024;

const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
];


// ============================================================
// GLOBALS
// ============================================================

let currentUser = null;
let referrals = [];

let editingReferralId = null;
let statusReferralId = null;
let deleteReferralId = null;
let detailsReferralId = null;


// ============================================================
// DEFECT OPTIONS
// ============================================================

const DEFECT_OPTIONS = [
    "1 - Neural Tube Defect",
    "2 - Downs Syndrome",
    "3 - Cleft Lip and Palate",
    "4 - Talipes (club foot)",
    "5 - Developmental Dysplasia of Hip",
    "6 - Congenital Cataract",
    "7 - Congenital Deafness",
    "8 - Congenital Heart Disease",
    "9 - Retinopathy of Prematurity (only at DH)",
    "47 - Congenital Ear Problems",
    "48 - Neck and Face Defects",
    "50 - Congenital Eye Problems"
];


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}


function val(id) {
    const element = $(id);

    if (!element) {
        return "";
    }

    return String(element.value || "").trim();
}


function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function today() {

    const d = new Date();

    const year = d.getFullYear();

    const month =
        String(d.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(d.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function cleanMobile(number) {

    if (!number) {
        return "";
    }

    return String(number)
        .replace(/\D/g, "")
        .slice(-10);
}


function formatDate(date) {

    if (!date) {
        return "—";
    }

    const str = String(date);

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {

        const parts = str.split("-");

        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    return str;
}


function statusLabel(status) {

    const map = {

        "Pending":
            "⏳ Pending",

        "Referred":
            "↗ Referred",

        "Treatment Started":
            "✚ Treatment Started",

        "Completed":
            "✓ Completed"
    };

    return map[status] || status || "Pending";
}


function statusClass(status) {

    return String(status || "pending")
        .toLowerCase()
        .replace(/\s+/g, "-");
}


// ============================================================
// MODAL HELPERS
// ============================================================

function showModal(id) {

    const element = $(id);

    if (!element) {
        console.error(`Modal not found: ${id}`);
        return;
    }

    /*
     * IMPORTANT:
     * CSS uses .show for modal visibility.
     */
    element.classList.add("show");

    element.classList.add("active");

    element.style.display = "flex";

    element.setAttribute(
        "aria-hidden",
        "false"
    );
}


function hideModal(id) {

    const element = $(id);

    if (!element) {
        return;
    }

    element.classList.remove("show");

    element.classList.remove("active");

    element.style.display = "none";

    element.setAttribute(
        "aria-hidden",
        "true"
    );
}


// ============================================================
// FIRESTORE REFERENCES
// ============================================================

function referralsCollection() {

    if (!currentUser) {
        throw new Error(
            "User is not logged in."
        );
    }

    return collection(
        db,
        "users",
        currentUser.uid,
        "referrals"
    );
}


function referralDocument(id) {

    if (!currentUser) {
        throw new Error(
            "User is not logged in."
        );
    }

    return doc(
        db,
        "users",
        currentUser.uid,
        "referrals",
        id
    );
}


function findRecord(id) {

    return referrals.find(
        record => record.id === id
    );
}


// ============================================================
// STATUS HISTORY
// ============================================================

function buildStatusHistory(record) {

    if (
        Array.isArray(record.statusHistory) &&
        record.statusHistory.length
    ) {

        return record.statusHistory.map(item => ({
            status: item.status || "",
            date: item.date || ""
        }));
    }

    const history = [];

    const registered =
        record.registeredDate ||
        record.registrationDate ||
        "";

    if (registered) {

        history.push({
            status: "Pending",
            date: registered
        });
    }

    if (record.referredDate) {

        history.push({
            status: "Referred",
            date: record.referredDate
        });
    }

    if (record.treatmentStartedDate) {

        history.push({
            status: "Treatment Started",
            date: record.treatmentStartedDate
        });
    }

    if (record.completedDate) {

        history.push({
            status: "Completed",
            date: record.completedDate
        });
    }

    if (!history.length) {

        history.push({
            status: record.status || "Pending",
            date: registered || today()
        });
    }

    return history;
}


function appendStatusHistory(
    record,
    status,
    date
) {

    const history =
        buildStatusHistory(record);

    const last =
        history[history.length - 1];

    if (
        last &&
        last.status === status
    ) {

        last.date = date;

    } else {

        history.push({
            status,
            date
        });
    }

    return history;
}


// ============================================================
// STATUS DATE
// ============================================================

function ensureStatusDateField() {

    if ($("statusDate")) {

        if (!$("statusDate").value) {
            $("statusDate").value = today();
        }

        return;
    }

    const form =
        $("statusForm");

    if (!form) {
        return;
    }

    const wrapper =
        document.createElement("label");

    wrapper.id =
        "statusDateWrap";

    wrapper.innerHTML = `
        Status Date
        <input
            type="date"
            id="statusDate"
            name="statusDate"
            required
        >
    `;

    const status =
        $("newStatus");

    if (
        status &&
        status.parentElement
    ) {

        status.parentElement.after(wrapper);

    } else {

        form.prepend(wrapper);
    }

    $("statusDate").value =
        today();
}


// ============================================================
// OTHER HOSPITAL
// ============================================================

function toggleOtherHospital() {

    const select =
        $("privateHospital");

    const wrapper =
        $("otherHospitalWrap");

    const input =
        $("otherHospitalName");

    if (!select) {
        return;
    }

    const isOther =
        select.value === "Other";

    if (wrapper) {

        wrapper.hidden =
            !isOther;

        wrapper.style.display =
            isOther ? "" : "none";
    }

    if (input) {

        input.required =
            isOther;

        if (!isOther) {
            input.value = "";
        }
    }
}


// ============================================================
// STATUS FIELDS
// ============================================================

function updateStatusFields() {

    const status =
        val("newStatus");

    const referType =
        val("referType");

    const referTypeWrap =
        $("referTypeWrap");

    const privateHospitalWrap =
        $("privateHospitalWrap");

    const treatmentFields =
        $("treatmentFields");

    if (status === "Referred") {

        if (referTypeWrap) {

            referTypeWrap.style.display =
                "";
        }

        const isPrivate =
            referType === "Private Hospital";

        if (privateHospitalWrap) {

            privateHospitalWrap.hidden =
                !isPrivate;

            privateHospitalWrap.style.display =
                isPrivate ? "" : "none";
        }

        if (treatmentFields) {

            treatmentFields.style.display =
                "none";
        }

    } else if (
        status === "Treatment Started"
    ) {

        if (referTypeWrap) {

            referTypeWrap.style.display =
                "none";
        }

        if (privateHospitalWrap) {

            privateHospitalWrap.hidden =
                true;

            privateHospitalWrap.style.display =
                "none";
        }

        if (treatmentFields) {

            treatmentFields.style.display =
                "";
        }

    } else {

        if (referTypeWrap) {

            referTypeWrap.style.display =
                "none";
        }

        if (privateHospitalWrap) {

            privateHospitalWrap.hidden =
                true;

            privateHospitalWrap.style.display =
                "none";
        }

        if (treatmentFields) {

            treatmentFields.style.display =
                "none";
        }
    }

    toggleOtherHospital();
}


// ============================================================
// DEFECTS
// ============================================================

function renderDefects(
    selected = []
) {

    const box =
        $("defectList");

    if (!box) {
        return;
    }

    box.innerHTML = "";

    DEFECT_OPTIONS.forEach(
        (defect, index) => {

            const label =
                document.createElement("label");

            label.className =
                "defect-item";

            const checkbox =
                document.createElement("input");

            checkbox.type =
                "checkbox";

            checkbox.id =
                `defect_${index}`;

            checkbox.name =
                "defects";

            checkbox.value =
                defect;

            checkbox.checked =
                selected.includes(defect);

            const span =
                document.createElement("span");

            span.textContent =
                defect;

            label.appendChild(
                checkbox
            );

            label.appendChild(
                span
            );

            box.appendChild(
                label
            );
        }
    );

    const otherLabel =
        document.createElement("label");

    otherLabel.className =
        "defect-item";

    const otherCheckbox =
        document.createElement("input");

    otherCheckbox.type =
        "checkbox";

    otherCheckbox.id =
        "otherDefectCheckbox";

    otherCheckbox.name =
        "defects";

    otherCheckbox.value =
        "Other Health Condition";

    const otherSpan =
        document.createElement("span");

    otherSpan.textContent =
        "Other Health Condition";

    otherLabel.appendChild(
        otherCheckbox
    );

    otherLabel.appendChild(
        otherSpan
    );

    box.appendChild(
        otherLabel
    );
}


function getSelectedDefects() {

    return [
        ...document.querySelectorAll(
            '#defectList input[type="checkbox"]:checked'
        )
    ].map(
        checkbox =>
            checkbox.value
    );
}


function updateOtherDefect() {

    const checkbox =
        $("otherDefectCheckbox");

    const box =
        $("otherDefectBox");

    const input =
        $("otherDefect");

    const checked =
        !!checkbox?.checked;

    if (box) {

        box.classList.toggle(
            "hidden",
            !checked
        );

        box.style.display =
            checked ? "" : "none";
    }

    if (input) {

        input.required =
            checked;

        if (!checked) {
            input.value = "";
        }
    }
}


function setDefects(record) {

    let defects = [];

    if (
        Array.isArray(record.defects)
    ) {

        defects =
            [...record.defects];

    } else if (
        record.defect
    ) {

        defects =
            String(record.defect)
                .split(",")
                .map(x => x.trim())
                .filter(Boolean);
    }

    renderDefects(
        defects
    );

    if (
        record.otherDefect &&
        $("otherDefectCheckbox")
    ) {

        $("otherDefectCheckbox").checked =
            true;

        if ($("otherDefect")) {

            $("otherDefect").value =
                record.otherDefect;
        }
    }

    updateOtherDefect();
}


// ============================================================
// INSTITUTE FIELDS
// ============================================================

function updateInstituteFields() {

    const type =
        val("instituteType");

    const classWrap =
        $("classWrap");

    const awcWrap =
        $("awcWrap");

    const mobile3Label =
        $("mobile3Label");

    if (classWrap) {

        classWrap.hidden =
            type !== "School";

        classWrap.style.display =
            type === "School"
                ? ""
                : "none";
    }

    if (awcWrap) {

        awcWrap.hidden =
            type !== "AWC";

        awcWrap.style.display =
            type === "AWC"
                ? ""
                : "none";
    }

    if (mobile3Label) {

        if (type === "School") {

            mobile3Label.textContent =
                "School Principal Mobile Number";

        } else if (type === "AWC") {

            mobile3Label.textContent =
                "AWC Worker Mobile Number";

        } else {

            mobile3Label.textContent =
                "Mobile Number";
        }
    }
}


// ============================================================
// CLOUDINARY FILE VALIDATION
// ============================================================

function validateFile(
    file,
    photo = false
) {

    if (!file) {

        throw new Error(
            "No file selected."
        );
    }

    if (
        file.size >
        MAX_FILE_SIZE
    ) {

        throw new Error(
            `${file.name} is larger than 10 MB.`
        );
    }

    const type =
        String(
            file.type || ""
        ).toLowerCase();

    if (
        !ALLOWED_TYPES.includes(type)
    ) {

        throw new Error(
            `${file.name}: only PDF, JPG, PNG and WEBP files are allowed.`
        );
    }

    if (
        photo &&
        !type.startsWith("image/")
    ) {

        throw new Error(
            "Child Photo must be an image."
        );
    }
}


// ============================================================
// CLOUDINARY UPLOAD
// ============================================================

// ============================================================
// SECURE CLOUDINARY UPLOAD THROUGH WORKER
// ============================================================

async function cloudinaryUpload(
    file,
    folder,
    type
) {
    validateFile(
        file,
        type === "child_photo"
    );

    if (!currentUser) {
        throw new Error(
            "Your session has expired. Please login again."
        );
    }

    /*
     * IMPORTANT:
     * Cloudinary API Key / API Secret are NOT kept
     * inside this browser-side JavaScript.
     *
     * Browser
     *   ↓ Firebase ID Token
     * Worker
     *   ↓ Cloudinary API credentials
     * Cloudinary
     */

    const WORKER_UPLOAD_URL =
        "https://refermanagement.vercel.app/cloudflare-worker.js/upload";

    const firebaseToken =
        await currentUser.getIdToken();

    /*
     * Extract referral ID from:
     *
     * rbsk/{uid}/{referralId}
     */
    const referralId =
        String(folder || "")
            .split("/")
            .filter(Boolean)
            .pop() || "";

    if (!referralId) {
        throw new Error(
            "Referral ID is missing."
        );
    }

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    formData.append(
        "referralId",
        referralId
    );

    formData.append(
        "fileType",
        type
    );

    const response =
        await fetch(
            WORKER_UPLOAD_URL,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${firebaseToken}`
                },

                body:
                    formData
            }
        );

    let data = {};

    try {
        data =
            await response.json();

    } catch {
        data = {};
    }

    if (
        !response.ok ||
        !data.url
    ) {

        console.error(
            "Secure upload response:",
            data
        );

        throw new Error(
            data.message ||
            data.error ||
            `Secure upload failed (${response.status}).`
        );
    }

    return {

        url:
            data.url,

        secureUrl:
            data.secureUrl ||
            data.url,

        publicId:
            data.publicId ||
            "",

        resourceType:
            data.resourceType ||
            "",

        format:
            data.format ||
            "",

        originalFilename:
            data.originalFilename ||
            file.name,

        bytes:
            data.bytes ||
            file.size,

        type:
            data.type ||
            type,

        version:
            data.version ||
            null
    };
}

// ============================================================
// UPLOAD STATUS
// ============================================================

function uploadMessage(
    message,
    type = "info"
) {

    const element =
        $("uploadStatus");

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.className =
        `upload-status show ${type}`;
}


// ============================================================
// SELECTED FILE DISPLAY
// ============================================================

function renderSelectedFiles() {

    const photo =
        $("childPhoto")
            ?.files?.[0];

    const documents =
        $("referralDocuments")
            ?.files
            ? [
                ...$("referralDocuments").files
            ]
            : [];

    if ($("childPhotoSelected")) {

        $("childPhotoSelected").textContent =
            photo
                ? `Selected: ${photo.name} (${(
                    photo.size / 1048576
                ).toFixed(1)} MB)`
                : "";
    }

    if (
        $("referralDocumentsSelected")
    ) {

        $("referralDocumentsSelected")
            .innerHTML =
            documents
                .map(
                    file =>
                        `• ${escapeHtml(file.name)} (${(
                            file.size / 1048576
                        ).toFixed(1)} MB)`
                )
                .join("<br>");
    }
}


// ============================================================
// UPLOAD SELECTED FILES
// ============================================================

async function uploadSelectedFiles(
    referralId,
    childName
) {

    const photo =
        $("childPhoto")
            ?.files?.[0] ||
        null;

    const documents =
        $("referralDocuments")
            ?.files
            ? [
                ...$("referralDocuments").files
            ]
            : [];

    if (
        !photo &&
        !documents.length
    ) {

        return {
            photo: null,
            docs: []
        };
    }

    if (photo) {

        validateFile(
            photo,
            true
        );
    }

    documents.forEach(
        file =>
            validateFile(file)
    );

    const total =
        (photo ? 1 : 0) +
        documents.length;

    let completed =
        0;

    uploadMessage(
        `Uploading files... 0/${total}`
    );

    let photoData =
        null;

    if (photo) {

        photoData =
            await cloudinaryUpload(
                photo,
                `rbsk/${currentUser.uid}/${referralId}`,
                "child_photo"
            );

        completed++;

        uploadMessage(
            `Uploading files... ${completed}/${total}`
        );
    }

    const uploadedDocuments =
        [];

    for (
        const file of documents
    ) {

        const uploaded =
            await cloudinaryUpload(
                file,
                `rbsk/${currentUser.uid}/${referralId}`,
                "document"
            );

        uploadedDocuments.push(
            uploaded
        );

        completed++;

        uploadMessage(
            `Uploading files... ${completed}/${total}`
        );
    }

    uploadMessage(
        `✓ ${total} file${total > 1 ? "s" : ""} uploaded successfully.`,
        "success"
    );

    return {
        photo: photoData,
        docs: uploadedDocuments
    };
}


// ============================================================
// FILES IN DETAILS
// ============================================================

function filesHtml(record) {

    let html = `
        <div class="details-section">
            <div class="details-section-title">
                📁 Documents & Photo
            </div>
    `;

    if (
        record.childPhoto?.url
    ) {

        html += `
            <div class="uploaded-photo-box">

                <img
                    src="${escapeHtml(record.childPhoto.url)}"
                    alt="Child Photo"
                    loading="lazy"
                >

                <div>

                    <strong>
                        Child Photo
                    </strong>

                    <div class="uploaded-file-actions">

                        <a
                            href="${escapeHtml(record.childPhoto.url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn light small"
                        >
                            View
                        </a>

                        <a
                            href="${escapeHtml(record.childPhoto.url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn primary small"
                            download
                        >
                            Download
                        </a>

                    </div>

                </div>

            </div>
        `;

    } else {

        html += `
            <div class="status-history-empty">
                No child photo uploaded.
            </div>
        `;
    }

    const documents =
        Array.isArray(record.documents)
            ? record.documents
            : [];

    if (documents.length) {

        html += `
            <div class="uploaded-documents">

                <strong>
                    Referral Documents
                </strong>
        `;

        documents.forEach(
            (file, index) => {

                if (!file?.url) {
                    return;
                }

                html += `
                    <div class="uploaded-file-row">

                        <div class="uploaded-file-name">
                            📄
                            ${escapeHtml(
                                file.originalFilename ||
                                file.fileName ||
                                `Document ${index + 1}`
                            )}
                        </div>

                        <div class="uploaded-file-actions">

                            <a
                                href="${escapeHtml(file.url)}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn light small"
                            >
                                View
                            </a>

                            <a
                                href="${escapeHtml(file.url)}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn primary small"
                                download
                            >
                                Download
                            </a>

                        </div>

                    </div>
                `;
            }
        );

        html += `
            </div>
        `;

    } else {

        html += `
            <div class="status-history-empty">
                No referral documents uploaded.
            </div>
        `;
    }

    html += `
        </div>
    `;

    return html;
}


// ============================================================
// CLEAR FORM
// ============================================================

function clearReferralForm() {

    const form =
        $("referralForm");

    if (form) {
        form.reset();
    }

    editingReferralId =
        null;

    renderDefects([]);

    updateOtherDefect();

    updateInstituteFields();

    if ($("referralModalTitle")) {

        $("referralModalTitle")
            .textContent =
            "New Referral";
    }

    if ($("saveReferralButton")) {

        $("saveReferralButton")
            .textContent =
            "Save Referral";

        $("saveReferralButton")
            .disabled =
            false;
    }

    if ($("childPhoto")) {

        $("childPhoto").value =
            "";
    }

    if ($("referralDocuments")) {

        $("referralDocuments").value =
            "";
    }

    if ($("uploadStatus")) {

        $("uploadStatus")
            .className =
            "upload-status";

        $("uploadStatus")
            .textContent =
            "";
    }

    renderSelectedFiles();
}


// ============================================================
// FILL EDIT FORM
// ============================================================

function fillReferralForm(
    record
) {

    const fields = [

        "childName",
        "sex",
        "dob",
        "birthCertificateNo",
        "fatherName",
        "fatherAadhaar",
        "motherName",
        "motherAadhaar",
        "villageName",
        "weight",
        "height",
        "instituteType",
        "instituteName",
        "className",
        "awcWorkerNumber",
        "mobile1",
        "mobile2",
        "mobile3"
    ];

    fields.forEach(
        id => {

            const element =
                $(id);

            if (!element) {
                return;
            }

            element.value =
                record[id] ?? "";
        }
    );

    setDefects(
        record
    );

    updateInstituteFields();

    /*
     * Browser security prevents us from
     * setting an existing file input.
     */
    if ($("childPhoto")) {

        $("childPhoto").value =
            "";
    }

    if ($("referralDocuments")) {

        $("referralDocuments").value =
            "";
    }

    renderSelectedFiles();
}


// ============================================================
// NEW REFERRAL BUTTON
// ============================================================

$("newReferral")
    ?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            clearReferralForm();

            showModal(
                "referralModal"
            );
        }
    );


// ============================================================
// CLOSE MODALS
// ============================================================

document
    .querySelectorAll(
        "[data-close], [data-close-modal]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    const target =
                        button.dataset.close ||
                        button.dataset.closeModal;

                    if (target) {

                        hideModal(
                            target
                        );
                    }
                }
            );
        }
    );


// ============================================================
// INSTITUTE TYPE
// ============================================================

$("instituteType")
    ?.addEventListener(
        "change",
        updateInstituteFields
    );


// ============================================================
// DEFECT OTHER
// ============================================================

$("defectList")
    ?.addEventListener(
        "change",
        event => {

            if (
                event.target &&
                event.target.id ===
                "otherDefectCheckbox"
            ) {

                updateOtherDefect();
            }
        }
    );


// ============================================================
// CHILD PHOTO
// ============================================================

$("childPhoto")
    ?.addEventListener(
        "change",
        () => {

            try {

                const file =
                    $("childPhoto")
                        ?.files?.[0];

                if (file) {

                    validateFile(
                        file,
                        true
                    );
                }

                renderSelectedFiles();

            } catch (error) {

                $("childPhoto").value =
                    "";

                renderSelectedFiles();

                alert(
                    error.message
                );
            }
        }
    );


// ============================================================
// REFERRAL DOCUMENTS
// ============================================================

$("referralDocuments")
    ?.addEventListener(
        "change",
        () => {

            try {

                const files =
                    $("referralDocuments")
                        ?.files
                        ? [
                            ...$("referralDocuments").files
                        ]
                        : [];

                files.forEach(
                    file =>
                        validateFile(file)
                );

                renderSelectedFiles();

            } catch (error) {

                $("referralDocuments").value =
                    "";

                renderSelectedFiles();

                alert(
                    error.message
                );
            }
        }
    );


// ============================================================
// EDIT REFERRAL
// ============================================================

window.editReferral =
    function (id) {

        const record =
            findRecord(id);

        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }

        editingReferralId =
            id;

        fillReferralForm(
            record
        );

        if ($("referralModalTitle")) {

            $("referralModalTitle")
                .textContent =
                "Edit Referral";
        }

        if ($("saveReferralButton")) {

            $("saveReferralButton")
                .textContent =
                "Save Changes";
        }

        hideModal(
            "detailsModal"
        );

        showModal(
            "referralModal"
        );
    };


// ============================================================
// SAVE NEW / EDIT REFERRAL
// ============================================================

$("referralForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            if (!currentUser) {

                alert(
                    "Your session has expired. Please login again."
                );

                location.href =
                    "index.html";

                return;
            }

            const wasEditing =
                !!editingReferralId;

            const existing =
                wasEditing
                    ? findRecord(
                        editingReferralId
                    )
                    : null;

            const childName =
                val("childName");

            const sex =
                val("sex");

            const dob =
                val("dob");

            const instituteType =
                val("instituteType");

            const instituteName =
                val("instituteName");

            const defects =
                getSelectedDefects();

            const otherDefect =
                val("otherDefect");


            // -----------------------------
            // VALIDATION
            // -----------------------------

            if (!childName) {

                alert(
                    "Please enter child name."
                );

                $("childName")
                    ?.focus();

                return;
            }


            if (!sex) {

                alert(
                    "Please select sex."
                );

                $("sex")
                    ?.focus();

                return;
            }


            if (!dob) {

                alert(
                    "Please select date of birth."
                );

                $("dob")
                    ?.focus();

                return;
            }


            if (
                !defects.length &&
                !otherDefect
            ) {

                alert(
                    "Please select at least one defect / health condition."
                );

                return;
            }


            if (!instituteType) {

                alert(
                    "Please select institute type."
                );

                $("instituteType")
                    ?.focus();

                return;
            }


            if (!instituteName) {

                alert(
                    "Please enter institute name."
                );

                $("instituteName")
                    ?.focus();

                return;
            }


            const saveButton =
                $("saveReferralButton");

            if (saveButton) {

                saveButton.disabled =
                    true;

                saveButton.textContent =
                    "Saving...";
            }


            try {

                // ---------------------------------
                // Create document reference first
                // ---------------------------------

                const reference =
                    wasEditing
                        ? referralDocument(
                            editingReferralId
                        )
                        : doc(
                            referralsCollection()
                        );

                const referralId =
                    reference.id;


                // ---------------------------------
                // Upload files
                // ---------------------------------

                const uploaded =
                    await uploadSelectedFiles(
                        referralId,
                        childName
                    );


                const oldDocuments =
                    Array.isArray(
                        existing?.documents
                    )
                        ? existing.documents
                        : [];


                // ---------------------------------
                // Referral data
                // ---------------------------------

                const referralData = {

                    childName,

                    sex,

                    dob,

                    birthCertificateNo:
                        val(
                            "birthCertificateNo"
                        ),

                    fatherName:
                        val(
                            "fatherName"
                        ),

                    fatherAadhaar:
                        val(
                            "fatherAadhaar"
                        ),

                    motherName:
                        val(
                            "motherName"
                        ),

                    motherAadhaar:
                        val(
                            "motherAadhaar"
                        ),

                    villageName:
                        val(
                            "villageName"
                        ),

                    weight:
                        val("weight"),

                    height:
                        val("height"),

                    defects,

                    otherDefect,

                    defect:
                        [
                            ...defects,
                            ...(otherDefect
                                ? [otherDefect]
                                : [])
                        ].join(", "),

                    instituteType,

                    instituteName,

                    className:
                        instituteType === "School"
                            ? val("className")
                            : "",

                    awcWorkerNumber:
                        instituteType === "AWC"
                            ? val(
                                "awcWorkerNumber"
                            )
                            : "",

                    mobile1:
                        cleanMobile(
                            val("mobile1")
                        ),

                    mobile2:
                        cleanMobile(
                            val("mobile2")
                        ),

                    mobile3:
                        cleanMobile(
                            val("mobile3")
                        ),

                    childPhoto:
                        uploaded.photo ||
                        existing?.childPhoto ||
                        null,

                    documents:
                        [
                            ...oldDocuments,
                            ...uploaded.docs
                        ],

                    updatedAt:
                        serverTimestamp()
                };


                // ---------------------------------
                // EDIT
                // ---------------------------------

                if (wasEditing) {

                    await updateDoc(
                        reference,
                        referralData
                    );

                }


                // ---------------------------------
                // NEW
                // ---------------------------------

                else {

                    const registrationDate =
                        today();

                    Object.assign(
                        referralData,
                        {

                            status:
                                "Pending",

                            registeredDate:
                                registrationDate,

                            registrationDate:
                                registrationDate,

                            referralDate:
                                registrationDate,

                            referredDate:
                                "",

                            treatmentStartedDate:
                                "",

                            completedDate:
                                "",

                            statusHistory:
                                [
                                    {
                                        status:
                                            "Pending",

                                        date:
                                            registrationDate
                                    }
                                ],

                            createdAt:
                                serverTimestamp()
                        }
                    );


                    await setDoc(
                        reference,
                        referralData
                    );
                }


                // ---------------------------------
                // Success
                // ---------------------------------

                hideModal(
                    "referralModal"
                );

                clearReferralForm();

                await loadRecords();

                alert(
                    wasEditing
                        ? "Referral updated successfully."
                        : "Referral saved successfully."
                );


            } catch (error) {

                console.error(
                    "Save referral error:",
                    error
                );

                uploadMessage(
                    error.message,
                    "error"
                );

                alert(
                    "Unable to save referral.\n\n" +
                    error.message
                );


            } finally {

                if (saveButton) {

                    saveButton.disabled =
                        false;

                    saveButton.textContent =
                        "Save Referral";
                }
            }
        }
    );


// ============================================================
// STATUS CHANGE
// ============================================================

$("newStatus")
    ?.addEventListener(
        "change",
        () => {

            ensureStatusDateField();

            if ($("statusDate")) {

                $("statusDate").value =
                    today();
            }

            updateStatusFields();
        }
    );


$("referType")
    ?.addEventListener(
        "change",
        updateStatusFields
    );


// ============================================================
// PRIVATE HOSPITAL CHANGE
// ============================================================

$("privateHospital")
    ?.addEventListener(
        "change",
        () => {

            toggleOtherHospital();

            const selected =
                val("privateHospital");

            const hospitalName =
                $("hospitalName");

            if (
                hospitalName &&
                selected &&
                selected !== "Other"
            ) {

                hospitalName.value =
                    selected;
            }

            if (
                selected === "Other" &&
                hospitalName
            ) {

                hospitalName.value =
                    val("otherHospitalName");
            }
        }
    );


$("otherHospitalName")
    ?.addEventListener(
        "input",
        () => {

            if (
                val("privateHospital") ===
                "Other"
            ) {

                if ($("hospitalName")) {

                    $("hospitalName").value =
                        val(
                            "otherHospitalName"
                        );
                }
            }
        }
    );


// ============================================================
// OPEN STATUS
// ============================================================

window.openStatus =
    function (id) {

        const record =
            findRecord(id);

        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }

        statusReferralId =
            id;

        ensureStatusDateField();


        if ($("newStatus")) {

            $("newStatus").value =
                record.status ||
                "Pending";
        }


        if ($("statusDate")) {

            $("statusDate").value =
                today();
        }


        if ($("referType")) {

            $("referType").value =
                record.referType ||
                "";
        }


        if ($("privateHospital")) {

            $("privateHospital").value =
                record.privateHospital ||
                "";
        }


        if ($("otherHospitalName")) {

            $("otherHospitalName").value =
                record.otherHospitalName ||
                "";
        }


        if ($("hospitalName")) {

            $("hospitalName").value =
                record.hospitalName ||
                "";
        }


        if ($("estimatedExpenditure")) {

            $("estimatedExpenditure").value =
                record.estimatedExpenditure ||
                "";
        }


        updateStatusFields();

        toggleOtherHospital();

        showModal(
            "statusModal"
        );
    };


// ============================================================
// SAVE STATUS
// ============================================================

$("statusForm")
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            if (
                !currentUser ||
                !statusReferralId
            ) {

                return;
            }

            const record =
                findRecord(
                    statusReferralId
                );

            if (!record) {

                alert(
                    "Referral record not found."
                );

                return;
            }

            ensureStatusDateField();


            const newStatus =
                val("newStatus") ||
                "Pending";

            const statusDate =
                val("statusDate") ||
                today();

            const referType =
                val("referType");

            const privateHospital =
                val("privateHospital");

            const otherHospitalName =
                val("otherHospitalName");

            const hospitalName =
                val("hospitalName");

            const estimatedExpenditure =
                val(
                    "estimatedExpenditure"
                );


            // ---------------------------------
            // VALIDATION
            // ---------------------------------

            if (
                newStatus === "Referred" &&
                !referType
            ) {

                alert(
                    "Please select Refer Type."
                );

                $("referType")
                    ?.focus();

                return;
            }


            if (
                newStatus === "Referred" &&
                referType ===
                "Private Hospital" &&
                !privateHospital
            ) {

                alert(
                    "Please select Hospital Name."
                );

                $("privateHospital")
                    ?.focus();

                return;
            }


            if (
                newStatus === "Referred" &&
                referType ===
                "Private Hospital" &&
                privateHospital ===
                "Other" &&
                !otherHospitalName
            ) {

                alert(
                    "Please enter Other Hospital Name."
                );

                $("otherHospitalName")
                    ?.focus();

                return;
            }


            const newHistory =
                appendStatusHistory(
                    record,
                    newStatus,
                    statusDate
                );


            const updateData = {

                status:
                    newStatus,

                statusDate:
                    statusDate,

                statusHistory:
                    newHistory,

                updatedAt:
                    serverTimestamp()
            };


            // ---------------------------------
            // REFERRED
            // ---------------------------------

            if (
                newStatus ===
                "Referred"
            ) {

                updateData.referType =
                    referType;

                updateData.referredDate =
                    statusDate;

                if (
                    referType ===
                    "Private Hospital"
                ) {

                    updateData.privateHospital =
                        privateHospital;

                    updateData.otherHospitalName =
                        privateHospital ===
                        "Other"
                            ? otherHospitalName
                            : "";

                    updateData.hospitalName =
                        privateHospital ===
                        "Other"
                            ? otherHospitalName
                            : privateHospital;

                } else {

                    updateData.privateHospital =
                        "";

                    updateData.otherHospitalName =
                        "";

                    updateData.hospitalName =
                        "DEIC";
                }
            }


            // ---------------------------------
            // TREATMENT STARTED
            // ---------------------------------

            if (
                newStatus ===
                "Treatment Started"
            ) {

                updateData.treatmentStartedDate =
                    statusDate;

                updateData.hospitalName =
                    hospitalName;

                updateData.estimatedExpenditure =
                    estimatedExpenditure;
            }


            // ---------------------------------
            // COMPLETED
            // ---------------------------------

            if (
                newStatus ===
                "Completed"
            ) {

                updateData.completedDate =
                    statusDate;
            }


            // ---------------------------------
            // PENDING
            // ---------------------------------

            if (
                newStatus ===
                "Pending"
            ) {

                updateData.registeredDate =
                    statusDate;
            }


            const button =
                $("statusForm")
                    ?.querySelector(
                        'button[type="submit"]'
                    );


            try {

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Saving...";
                }


                await updateDoc(
                    referralDocument(
                        statusReferralId
                    ),
                    updateData
                );


                hideModal(
                    "statusModal"
                );

                statusReferralId =
                    null;

                await loadRecords();


                alert(
                    "Status updated successfully."
                );


            } catch (error) {

                console.error(
                    "Status update error:",
                    error
                );

                alert(
                    "Unable to update status.\n\n" +
                    error.message
                );


            } finally {

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Update";
                }
            }
        }
    );


// ============================================================
// STATUS HISTORY HTML
// ============================================================

function historyHtml(record) {

    const history =
        buildStatusHistory(
            record
        );

    return `
        <div class="status-history-timeline">

            ${history.map(
                (item, index) => `

                    <div
                        class="status-history-item ${
                            index ===
                            history.length - 1
                                ? "current"
                                : ""
                        }"
                    >

                        <div
                            class="status-history-dot"
                        >
                            ${
                                index ===
                                history.length - 1
                                    ? "●"
                                    : "✓"
                            }
                        </div>

                        <div
                            class="status-history-content"
                        >

                            <div
                                class="status-history-status"
                            >
                                ${escapeHtml(
                                    statusLabel(
                                        item.status
                                    )
                                )}
                            </div>

                            <div
                                class="status-history-date"
                            >
                                ${escapeHtml(
                                    formatDate(
                                        item.date
                                    )
                                )}
                            </div>

                        </div>

                    </div>
            `
            ).join("")}

        </div>
    `;
}


// ============================================================
// VIEW DETAILS
// ============================================================

window.viewDetails =
    function (id) {

        const record =
            findRecord(id);

        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }

        detailsReferralId =
            id;


        if ($("detailsSubtitle")) {

            $("detailsSubtitle")
                .textContent =
                `${record.childName || ""} • ${record.instituteName || ""}`;
        }


        const defects =
            Array.isArray(
                record.defects
            )
                ? record.defects
                : (
                    record.defect
                        ? String(
                            record.defect
                        )
                            .split(",")
                            .map(
                                x =>
                                    x.trim()
                            )
                            .filter(Boolean)
                        : []
                );


        if (!$("detailsContent")) {

            return;
        }


        $("detailsContent")
            .innerHTML = `

            <div class="details-section">

                <div class="details-section-title">
                    👤 Child Details
                </div>

                <div class="details-grid">

                    <div>
                        <small>
                            Child Name
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.childName
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Sex
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.sex
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Date of Birth
                        </small>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    record.dob
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Birth Certificate No.
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.birthCertificateNo ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Village
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.villageName ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Weight
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.weight ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Height
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.height ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>


            <div class="details-section">

                <div class="details-section-title">
                    👨‍👩‍👦 Family Details
                </div>

                <div class="details-grid">

                    <div>
                        <small>
                            Father Name
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.fatherName ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Father Aadhaar
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.fatherAadhaar ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Mother Name
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.motherName ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Mother Aadhaar
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.motherAadhaar ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>


            <div class="details-section">

                <div class="details-section-title">
                    🏥 Health Condition
                </div>

                <div class="details-defects">

                    ${
                        defects.length
                            ? defects
                                .map(
                                    defect =>
                                        `<span class="defect-tag">${escapeHtml(defect)}</span>`
                                )
                                .join("")
                            : "—"
                    }

                </div>

                ${
                    record.otherDefect
                        ? `
                            <div class="other-health-condition">

                                <small>
                                    Other Health Condition
                                </small>

                                <strong>
                                    ${escapeHtml(
                                        record.otherDefect
                                    )}
                                </strong>

                            </div>
                        `
                        : ""
                }

            </div>


            <div class="details-section">

                <div class="details-section-title">
                    🏫 Institute Details
                </div>

                <div class="details-grid">

                    <div>
                        <small>
                            Institute Type
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.instituteType ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Institute Name
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.instituteName ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Class
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.className ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            AWC Worker Number
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.awcWorkerNumber ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>


            <div class="details-section">

                <div class="details-section-title">
                    📞 Contact Numbers
                </div>

                <div class="details-grid">

                    <div>
                        <small>
                            Mobile 1
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.mobile1 ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Mobile 2
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.mobile2 ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Mobile 3
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.mobile3 ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>


            ${filesHtml(record)}


            <div class="details-section">

                <div class="details-section-title">
                    📋 Referral Status History
                </div>

                ${historyHtml(record)}

            </div>


            <div class="details-section">

                <div class="details-section-title">
                    🏥 Referral / Treatment Details
                </div>

                <div class="details-grid">

                    <div>
                        <small>
                            Current Status
                        </small>

                        <strong>
                            ${escapeHtml(
                                statusLabel(
                                    record.status
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Registered Date
                        </small>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    record.registeredDate ||
                                    record.registrationDate
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Referred Date
                        </small>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    record.referredDate
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Treatment Started
                        </small>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    record.treatmentStartedDate
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Completed Date
                        </small>

                        <strong>
                            ${escapeHtml(
                                formatDate(
                                    record.completedDate
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Refer Type
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.referType ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Hospital
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.hospitalName ||
                                record.privateHospital ||
                                "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Estimated Expenditure
                        </small>

                        <strong>
                            ${escapeHtml(
                                record.estimatedExpenditure ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>
        `;


        hideModal(
            "referralModal"
        );

        showModal(
            "detailsModal"
        );
    };


// ============================================================
// DETAILS EDIT BUTTON
// ============================================================

$("detailsEdit")
    ?.addEventListener(
        "click",
        () => {

            if (
                detailsReferralId
            ) {

                window.editReferral(
                    detailsReferralId
                );
            }
        }
    );


// ============================================================
// DELETE REFERRAL
// ============================================================

window.deleteReferral =
    function (id) {

        const record =
            findRecord(id);

        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }

        deleteReferralId =
            id;

        if ($("deleteChildName")) {

            $("deleteChildName")
                .textContent =
                record.childName ||
                "";
        }

        showModal(
            "deleteModal"
        );
    };


// ============================================================
// CONFIRM DELETE
// ============================================================

$("confirmDelete")
    ?.addEventListener(
        "click",
        async () => {

            if (
                !deleteReferralId
            ) {

                return;
            }

            const button =
                $("confirmDelete");


            try {

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Deleting...";
                }


                await deleteDoc(
                    referralDocument(
                        deleteReferralId
                    )
                );


                deleteReferralId =
                    null;

                hideModal(
                    "deleteModal"
                );

                await loadRecords();


                alert(
                    "Referral deleted successfully."
                );


            } catch (error) {

                console.error(
                    "Delete error:",
                    error
                );

                alert(
                    "Unable to delete referral.\n\n" +
                    error.message
                );


            } finally {

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Delete Referral";
                }
            }
        }
    );


// ============================================================
// SEARCH / FILTER
// ============================================================

$("search")
    ?.addEventListener(
        "input",
        renderRecords
    );


$("statusFilter")
    ?.addEventListener(
        "change",
        renderRecords
    );


$("typeFilter")
    ?.addEventListener(
        "change",
        renderRecords
    );


// ============================================================
// RENDER RECORDS
// ============================================================

function renderRecords() {

    const container =
        $("records");

    if (!container) {
        return;
    }

    const search =
        val("search")
            .toLowerCase();

    const statusFilter =
        val("statusFilter");

    const typeFilter =
        val("typeFilter");


    const filtered =
        referrals.filter(
            record => {

                const text = [

                    record.childName,

                    record.fatherName,

                    record.motherName,

                    record.villageName,

                    record.instituteName,

                    record.mobile1,

                    record.mobile2,

                    record.mobile3,

                    record.defect,

                    record.otherDefect

                ]
                    .join(" ")
                    .toLowerCase();


                return (

                    !search ||
                    text.includes(
                        search
                    )

                ) && (

                    !statusFilter ||
                    record.status ===
                    statusFilter

                ) && (

                    !typeFilter ||
                    record.instituteType ===
                    typeFilter

                );
            }
        );


    if (!filtered.length) {

        container.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">
                    📋
                </div>

                <h3>
                    No referrals found
                </h3>

                <p>
                    Add a new referral to get started.
                </p>

            </div>
        `;

        updateStats();

        return;
    }


    container.innerHTML =
        filtered
            .map(
                record => {

                    const status =
                        record.status ||
                        "Pending";

                    return `

                        <article
                            class="referral-card status-${escapeHtml(
                                statusClass(
                                    status
                                )
                            )}"
                        >

                            <div
                                class="referral-card-top"
                            >

                                <div
                                    class="child-info"
                                >

                                    <h3>
                                        ${escapeHtml(
                                            record.childName ||
                                            "Unnamed Child"
                                        )}
                                    </h3>

                                    <div
                                        class="child-meta"
                                    >
                                        ${escapeHtml(
                                            record.sex ||
                                            ""
                                        )}

                                        ${
                                            record.dob
                                                ? ` • DOB: ${escapeHtml(
                                                    formatDate(
                                                        record.dob
                                                    )
                                                )}`
                                                : ""
                                        }
                                    </div>

                                </div>


                                <span
                                    class="status-badge ${escapeHtml(
                                        statusClass(
                                            status
                                        )
                                    )}"
                                >
                                    ${escapeHtml(
                                        statusLabel(
                                            status
                                        )
                                    )}
                                </span>

                            </div>


                            <div
                                class="referral-card-body"
                            >

                                <div
                                    class="record-info"
                                >

                                    <span>
                                        🏥
                                        ${escapeHtml(
                                            record.instituteName ||
                                            "—"
                                        )}
                                    </span>

                                    <span>
                                        📍
                                        ${escapeHtml(
                                            record.villageName ||
                                            "—"
                                        )}
                                    </span>

                                    <span>
                                        ❤️
                                        ${escapeHtml(
                                            record.defect ||
                                            "—"
                                        )}
                                    </span>

                                </div>

                            </div>


                            <div
                                class="referral-card-actions"
                            >

                                <button
                                    type="button"
                                    onclick="viewDetails('${escapeHtml(record.id)}')"
                                >
                                    View
                                </button>

                                <button
                                    type="button"
                                    onclick="editReferral('${escapeHtml(record.id)}')"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    onclick="openStatus('${escapeHtml(record.id)}')"
                                >
                                    Update Status
                                </button>

                                <button
                                    type="button"
                                    class="danger"
                                    onclick="deleteReferral('${escapeHtml(record.id)}')"
                                >
                                    Delete
                                </button>

                            </div>

                        </article>
                    `;
                }
            )
            .join("");


    updateStats();
}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const count =
        status =>
            referrals.filter(
                record =>
                    (
                        record.status ||
                        "Pending"
                    ) === status
            ).length;


    if ($("total")) {

        $("total").textContent =
            referrals.length;
    }


    if ($("pending")) {

        $("pending").textContent =
            count("Pending");
    }


    if ($("referred")) {

        $("referred").textContent =
            count("Referred");
    }


    if ($("started")) {

        $("started").textContent =
            count(
                "Treatment Started"
            );
    }


    if ($("completed")) {

        $("completed").textContent =
            count("Completed");
    }
}


// ============================================================
// LOAD RECORDS
// ============================================================

async function loadRecords() {

    if (!currentUser) {
        return;
    }

    const container =
        $("records");

    if (container) {

        container.innerHTML = `

            <div class="loading-state">
                Loading referrals...
            </div>
        `;
    }


    try {

        const snapshot =
            await getDocs(
                referralsCollection()
            );


        referrals =
            snapshot.docs.map(
                item => ({

                    id:
                        item.id,

                    ...item.data()
                })
            );


        referrals.sort(
            (a, b) => {

                const aDate =
                    a.registeredDate ||
                    a.registrationDate ||
                    "";

                const bDate =
                    b.registeredDate ||
                    b.registrationDate ||
                    "";

                return bDate.localeCompare(
                    aDate
                );
            }
        );


        renderRecords();


    } catch (error) {

        console.error(
            "Load records error:",
            error
        );

        if (container) {

            container.innerHTML = `

                <div class="empty-state">

                    <div class="empty-icon">
                        ⚠️
                    </div>

                    <h3>
                        Unable to load referrals
                    </h3>

                    <p>
                        ${escapeHtml(
                            error.message
                        )}
                    </p>

                </div>
            `;
        }
    }
}


// ============================================================
// LOGOUT
// ============================================================

$("logout")
    ?.addEventListener(
        "click",
        async () => {

            try {

                await signOut(
                    auth
                );

                location.href =
                    "index.html";

            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );

                alert(
                    "Unable to logout."
                );
            }
        }
    );


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            currentUser =
                null;

            location.href =
                "index.html";

            return;
        }


        currentUser =
            user;


        if ($("userMobile")) {

            $("userMobile")
                .textContent =
                user.email ||
                user.phoneNumber ||
                "";
        }


        ensureStatusDateField();

        renderDefects([]);

        updateOtherDefect();

        updateInstituteFields();

        updateStatusFields();

        toggleOtherHospital();

        renderSelectedFiles();

        await loadRecords();
    }
);


// ============================================================
// INITIAL UI SETUP
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        ensureStatusDateField();

        renderDefects([]);

        updateOtherDefect();

        updateInstituteFields();

        updateStatusFields();

        toggleOtherHospital();

        renderSelectedFiles();
    }
);


// ============================================================
// ESCAPE KEY - CLOSE MODALS
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Escape"
        ) {

            return;
        }

        [
            "referralModal",
            "statusModal",
            "detailsModal",
            "deleteModal"
        ]
            .forEach(
                id =>
                    hideModal(id)
            );
    }
);


// ============================================================
// GLOBAL API
// ============================================================

window.RBSK = {

    loadRecords,

    renderRecords,

    findRecord,

    today,

    cloudinaryUpload
};
