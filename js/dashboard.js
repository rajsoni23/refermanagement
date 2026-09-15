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
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
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
// CLOUDFLARE R2
// ============================================================
//
// Later, after Worker deployment, put Worker URL here.
//
// Example:
// const R2_UPLOAD_ENDPOINT =
//     "https://rbsk-files.your-subdomain.workers.dev";
//
// DO NOT put R2 Access Key / Secret Key here.
//

const R2_UPLOAD_ENDPOINT = "";


// ============================================================
// GLOBALS
// ============================================================

let currentUser = null;

let referrals = [];

let editingReferralId = null;

let statusReferralId = null;

let deleteReferralId = null;


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


function value(id) {
    const el = $(id);

    if (!el) {
        return "";
    }

    return String(el.value || "").trim();
}


function show(id) {
    const el = $(id);

    if (el) {
        el.style.display = "";
        el.classList.add("active");
    }
}


function hide(id) {
    const el = $(id);

    if (el) {
        el.style.display = "none";
        el.classList.remove("active");
    }
}


function cleanMobile(number) {

    if (!number) {
        return "";
    }

    return String(number)
        .replace(/\D/g, "")
        .slice(-10);
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

    const month = String(d.getMonth() + 1).padStart(2, "0");

    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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
        "Pending": "⏳ Pending",
        "Referred": "↗ Referred",
        "Treatment Started": "✚ Treatment Started",
        "Completed": "✓ Completed"
    };

    return map[status] || status || "Pending";
}


function statusClass(status) {

    return String(status || "pending")
        .toLowerCase()
        .replace(/\s+/g, "-");
}


// ============================================================
// FIRESTORE REFERENCES
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


function findRecord(id) {

    return referrals.find(
        item => item.id === id
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

    if (record.registeredDate) {

        history.push({
            status: "Pending",
            date: record.registeredDate
        });
    }

    if (
        record.referredDate &&
        !history.some(
            item => item.status === "Referred"
        )
    ) {

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
            date: record.registrationDate || today()
        });
    }

    return history;
}


function appendStatusHistory(
    record,
    newStatus,
    statusDate
) {

    const history = buildStatusHistory(record);

    const last = history[history.length - 1];

    if (
        last &&
        last.status === newStatus
    ) {

        last.date = statusDate;

        return history;
    }

    history.push({
        status: newStatus,
        date: statusDate
    });

    return history;
}


// ============================================================
// ENSURE STATUS DATE FIELD
// ============================================================

function ensureStatusDateField() {

    if ($("statusDate")) {
        $("statusDate").value = today();
        return;
    }

    const form = $("statusForm");

    if (!form) {
        return;
    }

    const wrapper = document.createElement("label");

    wrapper.id = "statusDateWrap";

    wrapper.innerHTML = `
        <span>Status Date</span>

        <input
            type="date"
            id="statusDate"
            name="statusDate"
            required
        >
    `;

    const statusSelect = $("newStatus");

    if (statusSelect) {

        statusSelect.parentElement?.after(wrapper);

    } else {

        form.prepend(wrapper);
    }

    $("statusDate").value = today();
}


// ============================================================
// OTHER HOSPITAL FIX
// ============================================================

function toggleOtherHospital() {

    const hospitalSelect = $("privateHospital");

    const otherWrap = $("otherHospitalWrap");

    const otherInput = $("otherHospitalName");

    if (!hospitalSelect) {
        return;
    }

    const selected =
        String(hospitalSelect.value || "")
            .trim()
            .toLowerCase();

    const isOther =
        selected === "other";

    if (otherWrap) {

        otherWrap.style.display =
            isOther ? "" : "none";
    }

    if (otherInput) {

        otherInput.required = isOther;

        if (!isOther) {
            otherInput.value = "";
        }
    }
}


// ============================================================
// STATUS FIELD VISIBILITY
// ============================================================

function updateStatusFields() {

    const status = value("newStatus");

    const referType = value("referType");

    const referTypeWrap = $("referTypeWrap");

    const privateHospitalWrap =
        $("privateHospitalWrap");

    const treatmentFields =
        $("treatmentFields");

    if (status === "Referred") {

        if (referTypeWrap) {
            referTypeWrap.style.display = "";
        }

        if (referType === "Private Hospital") {

            if (privateHospitalWrap) {
                privateHospitalWrap.style.display = "";
            }

        } else {

            if (privateHospitalWrap) {
                privateHospitalWrap.style.display = "none";
            }
        }

        if (treatmentFields) {
            treatmentFields.style.display = "none";
        }

    } else if (status === "Treatment Started") {

        if (referTypeWrap) {
            referTypeWrap.style.display = "none";
        }

        if (privateHospitalWrap) {
            privateHospitalWrap.style.display = "none";
        }

        if (treatmentFields) {
            treatmentFields.style.display = "";
        }

    } else {

        if (referTypeWrap) {
            referTypeWrap.style.display = "none";
        }

        if (privateHospitalWrap) {
            privateHospitalWrap.style.display = "none";
        }

        if (treatmentFields) {
            treatmentFields.style.display = "none";
        }
    }

    toggleOtherHospital();
}


// ============================================================
// DEFECT UI
// ============================================================

function renderDefects(selected = []) {

    const container = $("defectList");

    if (!container) {
        return;
    }

    const selectedValues =
        Array.isArray(selected)
            ? selected
            : [];

    container.innerHTML = "";

    DEFECT_OPTIONS.forEach(
        (defect, index) => {

            const id =
                `defect_${index}`;

            const label =
                document.createElement("label");

            label.innerHTML = `
                <input
                    type="checkbox"
                    id="${id}"
                    name="defects"
                    value="${escapeHtml(defect)}"
                    ${selectedValues.includes(defect) ? "checked" : ""}
                >

                <span>
                    ${escapeHtml(defect)}
                </span>
            `;

            container.appendChild(label);
        }
    );
}


function getSelectedDefects() {

    const checked =
        document.querySelectorAll(
            '#defectList input[type="checkbox"]:checked'
        );

    return Array.from(checked)
        .map(el => el.value);
}


function setupOtherDefect() {

    const checkbox =
        $("otherDefectCheckbox");

    const box =
        $("otherDefectBox");

    const input =
        $("otherDefect");

    if (!checkbox) {
        return;
    }

    checkbox.addEventListener(
        "change",
        () => {

            if (checkbox.checked) {

                if (box) {
                    box.style.display = "";
                }

                if (input) {
                    input.required = true;
                }

            } else {

                if (box) {
                    box.style.display = "none";
                }

                if (input) {
                    input.required = false;
                    input.value = "";
                }
            }
        }
    );
}


function setDefects(record) {

    const defects =
        Array.isArray(record.defects)
            ? record.defects
            : [];

    renderDefects(defects);

    const other =
        record.otherDefect || "";

    const checkbox =
        $("otherDefectCheckbox");

    const box =
        $("otherDefectBox");

    const input =
        $("otherDefect");

    if (other) {

        if (checkbox) {
            checkbox.checked = true;
        }

        if (box) {
            box.style.display = "";
        }

        if (input) {
            input.value = other;
        }

    } else {

        if (checkbox) {
            checkbox.checked = false;
        }

        if (box) {
            box.style.display = "none";
        }

        if (input) {
            input.value = "";
        }
    }
}


// ============================================================
// INSTITUTE UI
// ============================================================

function updateInstituteFields() {

    const type =
        value("instituteType");

    const classWrap =
        $("classWrap");

    const awcWrap =
        $("awcWrap");

    const mobile3Label =
        $("mobile3Label");

    if (type === "School") {

        if (classWrap) {
            classWrap.style.display = "";
        }

        if (awcWrap) {
            awcWrap.style.display = "none";
        }

        if (mobile3Label) {
            mobile3Label.textContent =
                "School Principal Mobile Number";
        }

    } else if (type === "AWC") {

        if (classWrap) {
            classWrap.style.display = "none";
        }

        if (awcWrap) {
            awcWrap.style.display = "";
        }

        if (mobile3Label) {
            mobile3Label.textContent =
                "AWC Worker Mobile Number";
        }

    } else {

        if (classWrap) {
            classWrap.style.display = "none";
        }

        if (awcWrap) {
            awcWrap.style.display = "none";
        }

        if (mobile3Label) {
            mobile3Label.textContent =
                "Mobile Number";
        }
    }
}


// ============================================================
// CLEAR REFERRAL FORM
// ============================================================

function clearReferralForm() {

    const form = $("referralForm");

    if (form) {
        form.reset();
    }

    editingReferralId = null;

    renderDefects([]);

    if ($("otherDefectBox")) {
        $("otherDefectBox").style.display =
            "none";
    }

    if ($("otherDefect")) {
        $("otherDefect").value = "";
    }

    updateInstituteFields();

    if ($("referralModalTitle")) {
        $("referralModalTitle").textContent =
            "New Referral";
    }

    if ($("saveReferralButton")) {
        $("saveReferralButton").textContent =
            "Save Referral";
    }
}


// ============================================================
// FILL REFERRAL FORM
// ============================================================

function fillReferralForm(record) {

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

    fields.forEach(id => {

        const el = $(id);

        if (!el) {
            return;
        }

        el.value =
            record[id] ??
            "";
    });

    setDefects(record);

    updateInstituteFields();
}


// ============================================================
// NEW REFERRAL
// ============================================================

$("newReferral")?.addEventListener(
    "click",
    () => {

        clearReferralForm();

        show("referralModal");
    }
);


// ============================================================
// CLOSE MODALS
// ============================================================

document.querySelectorAll(
    "[data-close-modal]"
).forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const target =
                button.dataset.closeModal;

            if (target) {
                hide(target);
            }
        }
    );
});


// ============================================================
// INSTITUTE CHANGE
// ============================================================

$("instituteType")?.addEventListener(
    "change",
    updateInstituteFields
);


// ============================================================
// STATUS CHANGE
// ============================================================

$("newStatus")?.addEventListener(
    "change",
    () => {

        ensureStatusDateField();

        if ($("statusDate")) {
            $("statusDate").value = today();
        }

        updateStatusFields();
    }
);


$("referType")?.addEventListener(
    "change",
    updateStatusFields
);


$("privateHospital")?.addEventListener(
    "change",
    () => {

        toggleOtherHospital();

        const selected =
            value("privateHospital");

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
    }
);


// ============================================================
// OPEN EDIT
// ============================================================

window.editReferral = function (id) {

    const record = findRecord(id);

    if (!record) {

        alert(
            "Referral record not found."
        );

        return;
    }

    editingReferralId = record.id;

    fillReferralForm(record);

    if ($("referralModalTitle")) {

        $("referralModalTitle").textContent =
            "Edit Referral";
    }

    if ($("saveReferralButton")) {

        $("saveReferralButton").textContent =
            "Save Changes";
    }

    hide("detailsModal");

    show("referralModal");
};


// ============================================================
// SAVE NEW / EDITED REFERRAL
// ============================================================

$("referralForm")?.addEventListener(
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

        const submitButton =
            $("saveReferralButton");

        const childName =
            value("childName");

        const sex =
            value("sex");

        const dob =
            value("dob");

        const instituteType =
            value("instituteType");

        const instituteName =
            value("instituteName");

        const selectedDefects =
            getSelectedDefects();

        const otherDefect =
            value("otherDefect");

        if (!childName) {

            alert(
                "Please enter child name."
            );

            $("childName")?.focus();

            return;
        }

        if (!sex) {

            alert(
                "Please select sex."
            );

            $("sex")?.focus();

            return;
        }

        if (!dob) {

            alert(
                "Please select date of birth."
            );

            $("dob")?.focus();

            return;
        }

        if (
            !selectedDefects.length &&
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

            $("instituteType")?.focus();

            return;
        }

        if (!instituteName) {

            alert(
                "Please enter institute name."
            );

            $("instituteName")?.focus();

            return;
        }

        if (submitButton) {

            submitButton.disabled = true;

            submitButton.textContent =
                "Saving...";
        }

        const registrationDate =
            editingReferralId
                ? (
                    findRecord(editingReferralId)
                        ?.registeredDate ||
                    findRecord(editingReferralId)
                        ?.registrationDate ||
                    today()
                )
                : today();

        const existing =
            editingReferralId
                ? findRecord(editingReferralId)
                : null;

        const referralData = {

            childName,

            sex,

            dob,

            birthCertificateNo:
                value("birthCertificateNo"),

            fatherName:
                value("fatherName"),

            fatherAadhaar:
                value("fatherAadhaar"),

            motherName:
                value("motherName"),

            motherAadhaar:
                value("motherAadhaar"),

            villageName:
                value("villageName"),

            weight:
                value("weight"),

            height:
                value("height"),

            defects:
                selectedDefects,

            otherDefect,

            defect:
                [
                    ...selectedDefects,
                    ...(otherDefect
                        ? [otherDefect]
                        : [])
                ].join(", "),

            instituteType,

            instituteName,

            className:
                instituteType === "School"
                    ? value("className")
                    : "",

            awcWorkerNumber:
                instituteType === "AWC"
                    ? value("awcWorkerNumber")
                    : "",

            mobile1:
                cleanMobile(
                    value("mobile1")
                ),

            mobile2:
                cleanMobile(
                    value("mobile2")
                ),

            mobile3:
                cleanMobile(
                    value("mobile3")
                ),

            updatedAt:
                serverTimestamp()
        };


        try {

            // ==================================================
            // EDIT
            // ==================================================

            if (editingReferralId) {

                await updateDoc(
                    referralDocument(
                        editingReferralId
                    ),
                    referralData
                );

            }

            // ==================================================
            // NEW
            // ==================================================

            else {

                referralData.status =
                    "Pending";

                referralData.registeredDate =
                    registrationDate;

                referralData.registrationDate =
                    registrationDate;

                referralData.referralDate =
                    registrationDate;

                referralData.referredDate =
                    "";

                referralData.treatmentStartedDate =
                    "";

                referralData.completedDate =
                    "";

                referralData.statusHistory = [
                    {
                        status: "Pending",
                        date: registrationDate
                    }
                ];

                referralData.createdAt =
                    serverTimestamp();

                await addDoc(
                    referralsCollection(),
                    referralData
                );
            }


            hide("referralModal");

            clearReferralForm();

            await loadRecords();

            alert(
                editingReferralId
                    ? "Referral updated successfully."
                    : "Referral saved successfully."
            );

        } catch (error) {

            console.error(
                "Save referral error:",
                error
            );

            alert(
                "Unable to save referral.\n\n" +
                error.message
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    editingReferralId
                        ? "Save Changes"
                        : "Save Referral";
            }
        }
    }
);


// ============================================================
// OPEN STATUS MODAL
// ============================================================

window.openStatus = function (id) {

    const record = findRecord(id);

    if (!record) {

        alert(
            "Referral record not found."
        );

        return;
    }

    statusReferralId = id;

    ensureStatusDateField();

    const statusSelect =
        $("newStatus");

    if (statusSelect) {

        statusSelect.value =
            record.status || "Pending";
    }

    if ($("statusDate")) {

        $("statusDate").value =
            today();
    }

    if ($("referType")) {

        $("referType").value =
            record.referType || "";
    }

    if ($("privateHospital")) {

        $("privateHospital").value =
            record.privateHospital || "";
    }

    if ($("otherHospitalName")) {

        $("otherHospitalName").value =
            record.otherHospitalName || "";
    }

    if ($("hospitalName")) {

        $("hospitalName").value =
            record.hospitalName || "";
    }

    if ($("estimatedExpenditure")) {

        $("estimatedExpenditure").value =
            record.estimatedExpenditure || "";
    }

    updateStatusFields();

    toggleOtherHospital();

    show("statusModal");
};


// ============================================================
// SAVE STATUS
// ============================================================

$("statusForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        if (!currentUser) {

            alert(
                "Your session has expired."
            );

            return;
        }

        if (!statusReferralId) {

            alert(
                "Referral not selected."
            );

            return;
        }

        const record =
            findRecord(statusReferralId);

        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }

        ensureStatusDateField();

        const newStatus =
            value("newStatus") || "Pending";

        const statusDate =
            value("statusDate") || today();

        const referType =
            value("referType");

        const privateHospital =
            value("privateHospital");

        const otherHospitalName =
            value("otherHospitalName");

        const hospitalName =
            value("hospitalName");

        const estimatedExpenditure =
            value("estimatedExpenditure");


        // ======================================================
        // REFERRED VALIDATION
        // ======================================================

        if (
            newStatus === "Referred" &&
            !referType
        ) {

            alert(
                "Please select Refer Type."
            );

            $("referType")?.focus();

            return;
        }


        if (
            newStatus === "Referred" &&
            referType === "Private Hospital" &&
            !privateHospital
        ) {

            alert(
                "Please select Hospital Name."
            );

            $("privateHospital")?.focus();

            return;
        }


        if (
            newStatus === "Referred" &&
            referType === "Private Hospital" &&
            privateHospital === "Other" &&
            !otherHospitalName
        ) {

            alert(
                "Please enter Other Hospital Name."
            );

            $("otherHospitalName")?.focus();

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


        // ======================================================
        // REFERRED
        // ======================================================

        if (newStatus === "Referred") {

            updateData.referType =
                referType;

            if (
                referType ===
                "Private Hospital"
            ) {

                updateData.privateHospital =
                    privateHospital;

                updateData.otherHospitalName =
                    privateHospital === "Other"
                        ? otherHospitalName
                        : "";

                updateData.hospitalName =
                    privateHospital === "Other"
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

            updateData.referredDate =
                statusDate;
        }


        // ======================================================
        // TREATMENT STARTED
        // ======================================================

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


        // ======================================================
        // COMPLETED
        // ======================================================

        if (
            newStatus ===
            "Completed"
        ) {

            updateData.completedDate =
                statusDate;
        }


        // ======================================================
        // PENDING
        // ======================================================

        if (newStatus === "Pending") {

            updateData.registeredDate =
                statusDate;
        }


        const saveButton =
            $("saveStatusButton");

        if (saveButton) {

            saveButton.disabled = true;

            saveButton.textContent =
                "Saving...";
        }


        try {

            await updateDoc(
                referralDocument(
                    statusReferralId
                ),
                updateData
            );

            hide("statusModal");

            statusReferralId = null;

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

            if (saveButton) {

                saveButton.disabled =
                    false;

                saveButton.textContent =
                    "Update Status";
            }
        }
    }
);


// ============================================================
// STATUS HISTORY HTML
// ============================================================

function statusHistoryHtml(record) {

    const history =
        buildStatusHistory(record);

    if (!history.length) {

        return `
            <div class="status-history-empty">
                No status history available.
            </div>
        `;
    }

    return `
        <div class="status-history-timeline">

            ${history.map(
                (item, index) => {

                    const isLast =
                        index === history.length - 1;

                    return `
                        <div
                            class="
                                status-history-item
                                ${isLast ? "current" : ""}
                            "
                        >

                            <div class="status-history-dot">
                                ${isLast ? "●" : "✓"}
                            </div>

                            <div class="status-history-content">

                                <div class="status-history-status">
                                    ${escapeHtml(
                                        statusLabel(item.status)
                                    )}
                                </div>

                                <div class="status-history-date">
                                    ${escapeHtml(
                                        formatDate(item.date)
                                    )}
                                </div>

                            </div>

                        </div>
                    `;
                }
            ).join("")}

        </div>
    `;
}


// ============================================================
// VIEW DETAILS
// ============================================================

window.viewDetails = function (id) {

    const record =
        findRecord(id);

    if (!record) {

        alert(
            "Referral record not found."
        );

        return;
    }

    hide("referralModal");

    if ($("detailsSubtitle")) {

        $("detailsSubtitle").textContent =
            `${record.childName || ""} • ${
                record.instituteName || ""
            }`;
    }


    const content =
        $("detailsContent");

    if (!content) {
        return;
    }


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


    content.innerHTML = `

        <div class="details-section">

            <div class="details-section-title">
                👤 Child Details
            </div>

            <div class="details-grid">

                <div>
                    <small>Child Name</small>
                    <strong>
                        ${escapeHtml(record.childName)}
                    </strong>
                </div>

                <div>
                    <small>Sex</small>
                    <strong>
                        ${escapeHtml(record.sex)}
                    </strong>
                </div>

                <div>
                    <small>Date of Birth</small>
                    <strong>
                        ${escapeHtml(
                            formatDate(record.dob)
                        )}
                    </strong>
                </div>

                <div>
                    <small>Birth Certificate No.</small>
                    <strong>
                        ${escapeHtml(
                            record.birthCertificateNo || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Village</small>
                    <strong>
                        ${escapeHtml(
                            record.villageName || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Weight</small>
                    <strong>
                        ${escapeHtml(
                            record.weight || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Height</small>
                    <strong>
                        ${escapeHtml(
                            record.height || "—"
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
                    <small>Father Name</small>
                    <strong>
                        ${escapeHtml(
                            record.fatherName || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Father Aadhaar</small>
                    <strong>
                        ${escapeHtml(
                            record.fatherAadhaar || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Mother Name</small>
                    <strong>
                        ${escapeHtml(
                            record.motherName || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Mother Aadhaar</small>
                    <strong>
                        ${escapeHtml(
                            record.motherAadhaar || "—"
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
                                    ${escapeHtml(defect)}
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
                            <small>Other Health Condition</small>
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
                    <small>Institute Type</small>
                    <strong>
                        ${escapeHtml(
                            record.instituteType || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Institute Name</small>
                    <strong>
                        ${escapeHtml(
                            record.instituteName || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Class</small>
                    <strong>
                        ${escapeHtml(
                            record.className || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>AWC Worker Number</small>
                    <strong>
                        ${escapeHtml(
                            record.awcWorkerNumber || "—"
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
                    <small>Mobile 1</small>
                    <strong>
                        ${escapeHtml(
                            record.mobile1 || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Mobile 2</small>
                    <strong>
                        ${escapeHtml(
                            record.mobile2 || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Mobile 3</small>
                    <strong>
                        ${escapeHtml(
                            record.mobile3 || "—"
                        )}
                    </strong>
                </div>

            </div>

        </div>


        <div class="details-section">

            <div class="details-section-title">
                📋 Referral Status History
            </div>

            ${statusHistoryHtml(record)}

        </div>


        <div class="details-section">

            <div class="details-section-title">
                🏥 Referral / Treatment Details
            </div>

            <div class="details-grid">

                <div>
                    <small>Current Status</small>
                    <strong>
                        ${escapeHtml(
                            statusLabel(
                                record.status
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <small>Registered Date</small>
                    <strong>
                        ${escapeHtml(
                            formatDate(
                                record.registeredDate
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <small>Referred Date</small>
                    <strong>
                        ${escapeHtml(
                            formatDate(
                                record.referredDate
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <small>Treatment Started</small>
                    <strong>
                        ${escapeHtml(
                            formatDate(
                                record.treatmentStartedDate
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <small>Completed Date</small>
                    <strong>
                        ${escapeHtml(
                            formatDate(
                                record.completedDate
                            )
                        )}
                    </strong>
                </div>

                <div>
                    <small>Refer Type</small>
                    <strong>
                        ${escapeHtml(
                            record.referType || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Hospital</small>
                    <strong>
                        ${escapeHtml(
                            record.hospitalName ||
                            record.privateHospital ||
                            "—"
                        )}
                    </strong>
                </div>

                <div>
                    <small>Estimated Expenditure</small>
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


    show("detailsModal");
};


// ============================================================
// DETAILS EDIT BUTTON
// ============================================================

$("detailsEdit")?.addEventListener(
    "click",
    () => {

        const subtitle =
            $("detailsSubtitle");

        if (!subtitle) {
            return;
        }

        const record =
            referrals.find(
                item =>
                    `${item.childName || ""} • ${
                        item.instituteName || ""
                    }`
                    === subtitle.textContent
            );

        if (record) {

            window.editReferral(
                record.id
            );
        }
    }
);


// ============================================================
// DELETE
// ============================================================

window.deleteReferral = function (id) {

    const record =
        findRecord(id);

    if (!record) {

        alert(
            "Referral record not found."
        );

        return;
    }

    deleteReferralId = id;

    if ($("deleteChildName")) {

        $("deleteChildName").textContent =
            record.childName || "";
    }

    show("deleteModal");
};


$("confirmDelete")?.addEventListener(
    "click",
    async () => {

        if (!deleteReferralId) {
            return;
        }

        const button =
            $("confirmDelete");

        if (button) {

            button.disabled = true;

            button.textContent =
                "Deleting...";
        }

        try {

            await deleteDoc(
                referralDocument(
                    deleteReferralId
                )
            );

            deleteReferralId = null;

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

            if (button) {

                button.disabled = false;

                button.textContent =
                    "Delete";
            }
        }
    }
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
        value("search")
            .toLowerCase();

    const statusFilter =
        value("statusFilter");

    const typeFilter =
        value("typeFilter");


    const filtered =
        referrals.filter(record => {

            const searchable = [
                record.childName,
                record.fatherName,
                record.motherName,
                record.villageName,
                record.instituteName,
                record.mobile1,
                record.mobile2,
                record.mobile3,
                record.defect
            ]
                .join(" ")
                .toLowerCase();


            if (
                search &&
                !searchable.includes(search)
            ) {
                return false;
            }


            if (
                statusFilter &&
                record.status !== statusFilter
            ) {
                return false;
            }


            if (
                typeFilter &&
                record.instituteType !== typeFilter
            ) {
                return false;
            }


            return true;
        });


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
        filtered.map(record => {

            const currentStatus =
                record.status || "Pending";

            return `
                <article
                    class="
                        referral-card
                        status-${escapeHtml(
                            statusClass(
                                currentStatus
                            )
                        )}
                    "
                >

                    <div class="referral-card-top">

                        <div class="child-info">

                            <h3>
                                ${escapeHtml(
                                    record.childName ||
                                    "Unnamed Child"
                                )}
                            </h3>

                            <div class="child-meta">

                                ${escapeHtml(
                                    record.sex || ""
                                )}

                                ${record.dob
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
                            class="
                                status-badge
                                ${escapeHtml(
                                    statusClass(
                                        currentStatus
                                    )
                                )}
                            "
                        >
                            ${escapeHtml(
                                statusLabel(
                                    currentStatus
                                )
                            )}
                        </span>

                    </div>


                    <div class="referral-card-body">

                        <div class="record-info">

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


                    <div class="referral-card-actions">

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

        }).join("");


    updateStats();
}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const total =
        referrals.length;

    const pending =
        referrals.filter(
            r => (r.status || "Pending")
                === "Pending"
        ).length;

    const referred =
        referrals.filter(
            r => r.status === "Referred"
        ).length;

    const started =
        referrals.filter(
            r =>
                r.status ===
                "Treatment Started"
        ).length;

    const completed =
        referrals.filter(
            r =>
                r.status ===
                "Completed"
        ).length;


    if ($("total")) {
        $("total").textContent = total;
    }

    if ($("pending")) {
        $("pending").textContent = pending;
    }

    if ($("referred")) {
        $("referred").textContent = referred;
    }

    if ($("started")) {
        $("started").textContent = started;
    }

    if ($("completed")) {
        $("completed").textContent = completed;
    }
}


// ============================================================
// SEARCH / FILTER
// ============================================================

$("search")?.addEventListener(
    "input",
    renderRecords
);


$("statusFilter")?.addEventListener(
    "change",
    renderRecords
);


$("typeFilter")?.addEventListener(
    "change",
    renderRecords
);


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

                    id: item.id,

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

$("logout")?.addEventListener(
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
// AUTH STATE
// ============================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            currentUser = null;

            location.href =
                "index.html";

            return;
        }

        currentUser = user;


        if ($("userMobile")) {

            $("userMobile").textContent =
                user.email ||
                user.phoneNumber ||
                "";
        }


        renderDefects([]);

        setupOtherDefect();

        ensureStatusDateField();

        updateInstituteFields();

        updateStatusFields();

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

        updateInstituteFields();

        updateStatusFields();

        toggleOtherHospital();
    }
);


// ============================================================
// ESC KEY → CLOSE ACTIVE MODAL
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") {
            return;
        }

        [
            "referralModal",
            "statusModal",
            "detailsModal",
            "deleteModal"
        ].forEach(id => {

            const el = $(id);

            if (
                el &&
                (
                    el.style.display !== "none"
                )
            ) {

                hide(id);
            }
        });
    }
);


// ============================================================
// R2 UPLOAD HELPER
// ============================================================
//
// This is intentionally safe:
// R2 secret credentials NEVER go into this JS.
//
// Once the Cloudflare Worker is ready:
//
// const R2_UPLOAD_ENDPOINT =
//     "https://your-worker.workers.dev";
//
// The Worker will receive the file and return:
// {
//     success: true,
//     url: "...",
//     key: "...",
//     fileName: "..."
// }
//
// ============================================================

async function uploadFileToR2(
    file,
    metadata = {}
) {

    if (!file) {
        throw new Error(
            "No file selected."
        );
    }

    if (!R2_UPLOAD_ENDPOINT) {

        throw new Error(
            "R2 upload endpoint is not configured yet."
        );
    }


    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );


    Object.entries(metadata)
        .forEach(
            ([key, val]) => {

                if (
                    val !== undefined &&
                    val !== null
                ) {

                    formData.append(
                        key,
                        String(val)
                    );
                }
            }
        );


    const response =
        await fetch(
            R2_UPLOAD_ENDPOINT,
            {
                method: "POST",
                body: formData
            }
        );


    if (!response.ok) {

        throw new Error(
            `R2 upload failed (${response.status})`
        );
    }


    const result =
        await response.json();


    if (!result.success) {

        throw new Error(
            result.message ||
            "R2 upload failed."
        );
    }


    return result;
}


// ============================================================
// OPTIONAL GLOBAL ACCESS
// ============================================================

window.RBSK = {

    uploadFileToR2,

    loadRecords,

    renderRecords,

    findRecord,

    today
};


// ============================================================
// END
// ============================================================
