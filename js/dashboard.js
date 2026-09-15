import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

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

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

const $ = id => document.getElementById(id);

const val = id =>
    $(id) ? String($(id).value || "").trim() : "";

const today = () => {
    const d = new Date();

    return `${d.getFullYear()}-${String(
        d.getMonth() + 1
    ).padStart(2, "0")}-${String(
        d.getDate()
    ).padStart(2, "0")}`;
};

const cleanMobile = number =>
    String(number || "")
        .replace(/\D/g, "")
        .slice(-10);

const esc = value =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const fmtDate = date => {
    if (!date) return "—";

    const str = String(date);

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str.split("-").reverse().join("-");
    }

    return str;
};

const statusLabel = status => ({
    Pending: "⏳ Pending",
    Referred: "↗ Referred",
    "Treatment Started": "✚ Treatment Started",
    Completed: "✓ Completed"
}[status] || status || "Pending");

const statusClass = status =>
    String(status || "pending")
        .toLowerCase()
        .replace(/\s+/g, "-");

function show(id) {
    const element = $(id);

    if (!element) return;

    element.style.display = "";
    element.classList.add("active");
    element.setAttribute("aria-hidden", "false");
}

function hide(id) {
    const element = $(id);

    if (!element) return;

    element.style.display = "none";
    element.classList.remove("active");
    element.setAttribute("aria-hidden", "true");
}

function findRecord(id) {
    return referrals.find(record => record.id === id);
}

// ============================================================
// FIRESTORE
// ============================================================

function referralsCollection() {
    return collection(
        db,
        "users",
        currentUser.uid,
        "referrals"
    );
}

function referralDocument(id) {
    return doc(
        db,
        "users",
        currentUser.uid,
        "referrals",
        id
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

    const registeredDate =
        record.registeredDate ||
        record.registrationDate;

    if (registeredDate) {
        history.push({
            status: "Pending",
            date: registeredDate
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
            date: registeredDate || today()
        });
    }

    return history;
}

function appendHistory(record, status, date) {

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

    const form = $("statusForm");

    if (!form) return;

    const wrapper =
        document.createElement("label");

    wrapper.id = "statusDateWrap";

    wrapper.innerHTML = `
        Status Date
        <input
            type="date"
            id="statusDate"
            name="statusDate"
            required
        >
    `;

    const statusField = $("newStatus");

    if (
        statusField &&
        statusField.parentElement
    ) {
        statusField.parentElement.after(wrapper);
    } else {
        form.prepend(wrapper);
    }

    $("statusDate").value = today();
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

    if (!select) return;

    const isOther =
        select.value === "Other";

    if (wrapper) {

        wrapper.hidden = !isOther;

        wrapper.style.display =
            isOther ? "" : "none";
    }

    if (input) {

        input.required = isOther;

        if (!isOther) {
            input.value = "";
        }
    }
}

// ============================================================
// STATUS UI
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
            referTypeWrap.style.display = "";
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
            privateHospitalWrap.hidden = true;
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
            privateHospitalWrap.hidden = true;
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

function renderDefects(selected = []) {

    const box = $("defectList");

    if (!box) return;

    box.innerHTML = DEFECT_OPTIONS
        .map((defect, index) => `
            <label class="defect-item">

                <input
                    type="checkbox"
                    id="defect_${index}"
                    name="defects"
                    value="${esc(defect)}"
                    ${selected.includes(defect)
                        ? "checked"
                        : ""}
                >

                <span>
                    ${esc(defect)}
                </span>

            </label>
        `)
        .join("");

    box.innerHTML += `
        <label class="defect-item">

            <input
                type="checkbox"
                id="otherDefectCheckbox"
                name="defects"
                value="Other Health Condition"
            >

            <span>
                Other Health Condition
            </span>

        </label>
    `;
}

function getDefects() {

    return [
        ...document.querySelectorAll(
            '#defectList input[type="checkbox"]:checked'
        )
    ].map(element => element.value);
}

function updateOtherDefect() {

    const checkbox =
        $("otherDefectCheckbox");

    const box =
        $("otherDefectBox");

    const input =
        $("otherDefect");

    const enabled =
        Boolean(checkbox?.checked);

    if (box) {

        box.classList.toggle(
            "hidden",
            !enabled
        );

        box.style.display =
            enabled ? "" : "none";
    }

    if (input) {

        input.required = enabled;

        if (!enabled) {
            input.value = "";
        }
    }
}

function setDefects(record) {

    const defects =
        Array.isArray(record.defects)
            ? record.defects
            : (
                record.defect
                    ? String(record.defect)
                        .split(",")
                        .map(x => x.trim())
                        .filter(Boolean)
                    : []
            );

    renderDefects(defects);

    if (record.otherDefect) {

        if ($("otherDefectCheckbox")) {
            $("otherDefectCheckbox").checked =
                true;
        }

        if ($("otherDefect")) {
            $("otherDefect").value =
                record.otherDefect;
        }
    }

    updateOtherDefect();
}

// ============================================================
// INSTITUTE
// ============================================================

function updateInstituteFields() {

    const type =
        val("instituteType");

    const classWrap =
        $("classWrap");

    const awcWrap =
        $("awcWrap");

    const mobileLabel =
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

    if (mobileLabel) {

        mobileLabel.textContent =
            type === "School"
                ? "School Principal Mobile Number"
                : type === "AWC"
                    ? "AWC Worker Mobile Number"
                    : "Mobile Number";
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

    if (file.size > MAX_FILE_SIZE) {

        throw new Error(
            `${file.name} is larger than 10 MB.`
        );
    }

    const type =
        String(file.type || "")
            .toLowerCase();

    if (!ALLOWED_TYPES.includes(type)) {

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

async function cloudinaryUpload(
    file,
    folder,
    type
) {

    validateFile(
        file,
        type === "child_photo"
    );

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );

    formData.append(
        "upload_preset",
        CLOUDINARY_UPLOAD_PRESET
    );

    formData.append(
        "folder",
        folder
    );

    const response =
        await fetch(
            CLOUDINARY_UPLOAD_URL,
            {
                method: "POST",
                body: formData
            }
        );

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (
        !response.ok ||
        !data.secure_url
    ) {

        throw new Error(
            data.error?.message ||
            `Cloudinary upload failed (${response.status}).`
        );
    }

    return {

        url: data.secure_url,

        secureUrl:
            data.secure_url,

        publicId:
            data.public_id || "",

        resourceType:
            data.resource_type || "",

        format:
            data.format || "",

        originalFilename:
            file.name,

        bytes:
            file.size,

        type
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

    if (!element) return;

    element.textContent =
        message;

    element.className =
        `upload-status show ${type}`;
}

function renderSelectedFiles() {

    const photo =
        $("childPhoto")?.files?.[0];

    const documents =
        [
            ...(
                $("referralDocuments")
                    ?.files || []
            )
        ];

    if ($("childPhotoSelected")) {

        $("childPhotoSelected")
            .textContent = photo
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
                            `• ${esc(file.name)} (${(
                                file.size /
                                1048576
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
        $("childPhoto")?.files?.[0] ||
        null;

    const documents =
        [
            ...(
                $("referralDocuments")
                    ?.files || []
            )
        ];

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
        file => validateFile(file)
    );

    const total =
        (photo ? 1 : 0) +
        documents.length;

    let completed = 0;

    uploadMessage(
        `Uploading files... 0/${total}`
    );

    let photoData = null;

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

    const uploadedDocuments = [];

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
                    src="${esc(
                        record.childPhoto.url
                    )}"
                    alt="Child Photo"
                    loading="lazy"
                >

                <div>

                    <strong>
                        Child Photo
                    </strong>

                    <div class="uploaded-file-actions">

                        <a
                            href="${esc(
                                record.childPhoto.url
                            )}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="btn light small"
                        >
                            View
                        </a>

                        <a
                            href="${esc(
                                record.childPhoto.url
                            )}"
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

                if (!file?.url) return;

                html += `
                    <div class="uploaded-file-row">

                        <div class="uploaded-file-name">
                            📄 ${esc(
                                file.originalFilename ||
                                file.fileName ||
                                `Document ${index + 1}`
                            )}
                        </div>

                        <div class="uploaded-file-actions">

                            <a
                                href="${esc(file.url)}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn light small"
                            >
                                View
                            </a>

                            <a
                                href="${esc(file.url)}"
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

    return html + `
        </div>
    `;
}

// ============================================================
// FORM RESET
// ============================================================

function clearForm() {

    $("referralForm")?.reset();

    editingReferralId = null;

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
    }

    if ($("childPhoto")) {
        $("childPhoto").value = "";
    }

    if ($("referralDocuments")) {
        $("referralDocuments").value = "";
    }

    if ($("uploadStatus")) {
        $("uploadStatus")
            .className =
            "upload-status";
    }

    renderSelectedFiles();
}

// ============================================================
// FILL EDIT FORM
// ============================================================

function fillForm(record) {

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

            if ($(id)) {
                $(id).value =
                    record[id] ?? "";
            }
        }
    );

    setDefects(record);

    updateInstituteFields();

    // Existing Cloudinary files are preserved.
    // New files can be selected separately.

    if ($("childPhoto")) {
        $("childPhoto").value = "";
    }

    if ($("referralDocuments")) {
        $("referralDocuments").value = "";
    }

    renderSelectedFiles();
}

// ============================================================
// NEW REFERRAL
// ============================================================

$("newReferral")
    ?.addEventListener(
        "click",
        () => {

            clearForm();

            show("referralModal");
        }
    );

// ============================================================
// CLOSE BUTTONS
// ============================================================

document
    .querySelectorAll(
        "[data-close], [data-close-modal]"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const target =
                        button.dataset.close ||
                        button.dataset.closeModal;

                    if (target) {
                        hide(target);
                    }
                }
            );
        }
    );

// ============================================================
// INSTITUTE CHANGE
// ============================================================

$("instituteType")
    ?.addEventListener(
        "change",
        updateInstituteFields
    );

// ============================================================
// DEFECT CHANGE
// ============================================================

$("defectList")
    ?.addEventListener(
        "change",
        event => {

            if (
                event.target?.id ===
                "otherDefectCheckbox"
            ) {

                updateOtherDefect();
            }
        }
    );

// ============================================================
// PHOTO CHANGE
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

                $("childPhoto").value = "";

                renderSelectedFiles();

                alert(
                    error.message
                );
            }
        }
    );

// ============================================================
// DOCUMENT CHANGE
// ============================================================

$("referralDocuments")
    ?.addEventListener(
        "change",
        () => {

            try {

                [
                    ...$("referralDocuments")
                        .files
                ].forEach(
                    file =>
                        validateFile(file)
                );

                renderSelectedFiles();

            } catch (error) {

                $("referralDocuments")
                    .value = "";

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
    id => {

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

        fillForm(record);

        $("referralModalTitle")
            .textContent =
            "Edit Referral";

        $("saveReferralButton")
            .textContent =
            "Save Changes";

        hide("detailsModal");

        show("referralModal");
    };

// ============================================================
// SAVE REFERRAL
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

                return;
            }

            const wasEditing =
                Boolean(editingReferralId);

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
                getDefects();

            const otherDefect =
                val("otherDefect");

            if (!childName) {
                alert(
                    "Please enter child name."
                );
                return;
            }

            if (!sex) {
                alert(
                    "Please select sex."
                );
                return;
            }

            if (!dob) {
                alert(
                    "Please select date of birth."
                );
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

                return;
            }

            if (!instituteName) {

                alert(
                    "Please enter institute name."
                );

                return;
            }

            const button =
                $("saveReferralButton");

            if (button) {

                button.disabled = true;

                button.textContent =
                    "Saving...";
            }

            try {

                const referralRef =
                    wasEditing
                        ? referralDocument(
                            editingReferralId
                        )
                        : doc(
                            referralsCollection()
                        );

                const referralId =
                    referralRef.id;

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

                const data = {

                    childName,

                    sex,

                    dob,

                    birthCertificateNo:
                        val(
                            "birthCertificateNo"
                        ),

                    fatherName:
                        val("fatherName"),

                    fatherAadhaar:
                        val("fatherAadhaar"),

                    motherName:
                        val("motherName"),

                    motherAadhaar:
                        val("motherAadhaar"),

                    villageName:
                        val("villageName"),

                    weight:
                        val("weight"),

                    height:
                        val("height"),

                    defects,

                    otherDefect,

                    defect: [
                        ...defects,
                        ...(otherDefect
                            ? [otherDefect]
                            : [])
                    ].join(", "),

                    instituteType,

                    instituteName,

                    className:
                        instituteType ===
                        "School"
                            ? val("className")
                            : "",

                    awcWorkerNumber:
                        instituteType ===
                        "AWC"
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

                    documents: [
                        ...oldDocuments,
                        ...uploaded.docs
                    ],

                    updatedAt:
                        serverTimestamp()
                };

                if (wasEditing) {

                    await updateDoc(
                        referralRef,
                        data
                    );

                } else {

                    const registrationDate =
                        today();

                    Object.assign(
                        data,
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

                            statusHistory: [
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
                        referralRef,
                        data
                    );
                }

                hide("referralModal");

                clearForm();

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

                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        editingReferralId
                            ? "Save Changes"
                            : "Save Referral";
                }
            }
        }
    );

// ============================================================
// STATUS EVENTS
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

$("privateHospital")
    ?.addEventListener(
        "change",
        () => {

            toggleOtherHospital();

            const selected =
                val("privateHospital");

            if (
                $("hospitalName") &&
                selected &&
                selected !== "Other"
            ) {

                $("hospitalName")
                    .value =
                    selected;
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

                    $("hospitalName")
                        .value =
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
    id => {

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

        $("newStatus").value =
            record.status ||
            "Pending";

        $("statusDate").value =
            today();

        $("referType").value =
            record.referType ||
            "";

        $("privateHospital").value =
            record.privateHospital ||
            "";

        $("otherHospitalName").value =
            record.otherHospitalName ||
            "";

        $("hospitalName").value =
            record.hospitalName ||
            "";

        $("estimatedExpenditure").value =
            record.estimatedExpenditure ||
            "";

        updateStatusFields();

        show("statusModal");
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

            const status =
                val("newStatus") ||
                "Pending";

            const date =
                val("statusDate") ||
                today();

            const referType =
                val("referType");

            const privateHospital =
                val("privateHospital");

            const otherHospital =
                val("otherHospitalName");

            if (
                status === "Referred" &&
                !referType
            ) {

                alert(
                    "Please select Refer Type."
                );

                return;
            }

            if (
                status === "Referred" &&
                referType ===
                    "Private Hospital" &&
                !privateHospital
            ) {

                alert(
                    "Please select Hospital Name."
                );

                return;
            }

            if (
                status === "Referred" &&
                referType ===
                    "Private Hospital" &&
                privateHospital ===
                    "Other" &&
                !otherHospital
            ) {

                alert(
                    "Please enter Other Hospital Name."
                );

                return;
            }

            const data = {

                status,

                statusDate:
                    date,

                statusHistory:
                    appendHistory(
                        record,
                        status,
                        date
                    ),

                updatedAt:
                    serverTimestamp()
            };

            if (
                status === "Referred"
            ) {

                data.referType =
                    referType;

                data.referredDate =
                    date;

                data.privateHospital =
                    referType ===
                    "Private Hospital"
                        ? privateHospital
                        : "";

                data.otherHospitalName =
                    referType ===
                        "Private Hospital" &&
                    privateHospital ===
                        "Other"
                        ? otherHospital
                        : "";

                data.hospitalName =
                    referType ===
                        "Private Hospital"
                        ? (
                            privateHospital ===
                            "Other"
                                ? otherHospital
                                : privateHospital
                        )
                        : "DEIC";
            }

            if (
                status ===
                "Treatment Started"
            ) {

                data.treatmentStartedDate =
                    date;

                data.hospitalName =
                    val("hospitalName");

                data.estimatedExpenditure =
                    val(
                        "estimatedExpenditure"
                    );
            }

            if (
                status ===
                "Completed"
            ) {

                data.completedDate =
                    date;
            }

            if (
                status ===
                "Pending"
            ) {

                data.registeredDate =
                    date;
            }

            const button =
                $("statusForm")
                    .querySelector(
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
                    data
                );

                hide("statusModal");

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
                        class="
                            status-history-item
                            ${
                                index ===
                                history.length - 1
                                    ? "current"
                                    : ""
                            }
                        "
                    >

                        <div class="status-history-dot">
                            ${
                                index ===
                                history.length - 1
                                    ? "●"
                                    : "✓"
                            }
                        </div>

                        <div class="status-history-content">

                            <div class="status-history-status">
                                ${esc(
                                    statusLabel(
                                        item.status
                                    )
                                )}
                            </div>

                            <div class="status-history-date">
                                ${esc(
                                    fmtDate(
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
    id => {

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

        $("detailsSubtitle")
            .textContent =
            `${record.childName || ""} • ${
                record.instituteName || ""
            }`;

        const defects =
            Array.isArray(record.defects)
                ? record.defects
                : (
                    record.defect
                        ? String(record.defect)
                            .split(",")
                            .map(x => x.trim())
                            .filter(Boolean)
                        : []
                );

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
                            ${esc(
                                record.childName
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Sex
                        </small>
                        <strong>
                            ${esc(
                                record.sex
                            )}
                        </strong>
                    </div>

                    <div>
                        <small>
                            Date of Birth
                        </small>
                        <strong>
                            ${esc(
                                fmtDate(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ? defects.map(
                                defect => `
                                    <span class="defect-tag">
                                        ${esc(
                                            defect
                                        )}
                                    </span>
                                `
                            ).join("")
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
                                    ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
                                fmtDate(
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
                            ${esc(
                                fmtDate(
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
                            ${esc(
                                fmtDate(
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
                            ${esc(
                                fmtDate(
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
                            ${esc(
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
                            ${esc(
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
                            ${esc(
                                record.estimatedExpenditure ||
                                "—"
                            )}
                        </strong>
                    </div>

                </div>

            </div>
        `;

        hide("referralModal");

        show("detailsModal");
    };

// ============================================================
// DETAILS EDIT
// ============================================================

$("detailsEdit")
    ?.addEventListener(
        "click",
        () => {

            if (detailsReferralId) {

                window.editReferral(
                    detailsReferralId
                );
            }
        }
    );

// ============================================================
// DELETE
// ============================================================

window.deleteReferral =
    id => {

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

        show("deleteModal");
    };

$("confirmDelete")
    ?.addEventListener(
        "click",
        async () => {

            if (!deleteReferralId) {
                return;
            }

            const button =
                $("confirmDelete");

            try {

                button.disabled =
                    true;

                button.textContent =
                    "Deleting...";

                await deleteDoc(
                    referralDocument(
                        deleteReferralId
                    )
                );

                deleteReferralId =
                    null;

                hide("deleteModal");

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

                button.disabled =
                    false;

                button.textContent =
                    "Delete Referral";
            }
        }
    );

// ============================================================
// RENDER RECORDS
// ============================================================

function renderRecords() {

    const box =
        $("records");

    if (!box) return;

    const search =
        val("search").toLowerCase();

    const statusFilter =
        val("statusFilter");

    const typeFilter =
        val("typeFilter");

    const list =
        referrals.filter(
            record => {

                const searchable = [
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
                    (!search ||
                        searchable.includes(
                            search
                        )) &&
                    (!statusFilter ||
                        record.status ===
                            statusFilter) &&
                    (!typeFilter ||
                        record.instituteType ===
                            typeFilter)
                );
            }
        );

    if (!list.length) {

        box.innerHTML = `
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

    box.innerHTML =
        list.map(
            record => {

                const status =
                    record.status ||
                    "Pending";

                return `
                    <article
                        class="
                            referral-card
                            status-${esc(
                                statusClass(
                                    status
                                )
                            )}
                        "
                    >

                        <div
                            class="referral-card-top"
                        >

                            <div
                                class="child-info"
                            >

                                <h3>
                                    ${esc(
                                        record.childName ||
                                        "Unnamed Child"
                                    )}
                                </h3>

                                <div
                                    class="child-meta"
                                >
                                    ${esc(
                                        record.sex ||
                                        ""
                                    )}

                                    ${
                                        record.dob
                                            ? ` • DOB: ${esc(
                                                fmtDate(
                                                    record.dob
                                                )
                                            )}`
                                            : ""
                                    }
                                </div>

                            </div>

                            <span
                                class="
                                    status-badge
                                    ${esc(
                                        statusClass(
                                            status
                                        )
                                    )}
                                "
                            >
                                ${esc(
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
                                    ${esc(
                                        record.instituteName ||
                                        "—"
                                    )}
                                </span>

                                <span>
                                    📍
                                    ${esc(
                                        record.villageName ||
                                        "—"
                                    )}
                                </span>

                                <span>
                                    ❤️
                                    ${esc(
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
                                onclick="viewDetails('${record.id}')"
                            >
                                View
                            </button>

                            <button
                                type="button"
                                onclick="editReferral('${record.id}')"
                            >
                                Edit
                            </button>

                            <button
                                type="button"
                                onclick="openStatus('${record.id}')"
                            >
                                Update Status
                            </button>

                            <button
                                type="button"
                                class="danger"
                                onclick="deleteReferral('${record.id}')"
                            >
                                Delete
                            </button>

                        </div>

                    </article>
                `;
            }
        ).join("");

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
// SEARCH
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
// LOAD RECORDS
// ============================================================

async function loadRecords() {

    if (!currentUser) return;

    const box =
        $("records");

    if (box) {

        box.innerHTML = `
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
                document => ({
                    id: document.id,
                    ...document.data()
                })
            );

        referrals.sort(
            (a, b) => {

                const dateA =
                    a.registeredDate ||
                    a.registrationDate ||
                    "";

                const dateB =
                    b.registeredDate ||
                    b.registrationDate ||
                    "";

                return dateB.localeCompare(
                    dateA
                );
            }
        );

        renderRecords();

    } catch (error) {

        console.error(
            "Load records error:",
            error
        );

        if (box) {

            box.innerHTML = `
                <div class="empty-state">

                    <div class="empty-icon">
                        ⚠️
                    </div>

                    <h3>
                        Unable to load referrals
                    </h3>

                    <p>
                        ${esc(
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

                await signOut(auth);

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
// AUTH
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

        renderSelectedFiles();

        await loadRecords();
    }
);

// ============================================================
// INITIAL UI
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
// ESC KEY
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
        ].forEach(
            id => {

                const element =
                    $(id);

                if (
                    element &&
                    (
                        element.classList
                            .contains(
                                "active"
                            ) ||
                        element.style.display !==
                            "none"
                    )
                ) {

                    hide(id);
                }
            }
        );
    }
);

// ============================================================
// GLOBAL
// ============================================================

window.RBSK = {

    loadRecords,

    renderRecords,

    findRecord,

    today,

    cloudinaryUpload

};
