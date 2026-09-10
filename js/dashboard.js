import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


// ============================================================
// FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;
let currentReferralId = null;
let currentDeleteId = null;
let editingReferralId = null;
let records = [];


// ============================================================
// HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function cleanMobile(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function value(id) {
    return String($(id)?.value || "").trim();
}

function show(id) {
    const el = $(id);
    if (!el) return;

    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
}

function hide(id) {
    const el = $(id);
    if (!el) return;

    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
}


// ============================================================
// DATE HELPERS
// ============================================================

/*
    Firestore me dates YYYY-MM-DD format me save hongi.

    Example:
    2026-09-10

    UI me:
    10/09/2026
*/

function formatUserDate(dateValue) {

    if (!dateValue) return "-";

    let dateString = String(dateValue);

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {

        const [year, month, day] = dateString.split("-");

        return `${day}/${month}/${year}`;
    }

    // DD/MM/YYYY already
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        return dateString;
    }

    return dateString;
}


function getTodayInputDate() {

    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


// ============================================================
// FIREBASE ERROR
// ============================================================

function firebaseErrorMessage(error) {

    console.error("RBSK Firebase Error:", error);

    switch (error?.code) {

        case "permission-denied":
            return "Permission denied. Please check Firestore security rules.";

        case "unavailable":
            return "Firebase is temporarily unavailable. Please check your internet connection.";

        case "failed-precondition":
            return "Firestore configuration is incomplete.";

        case "not-found":
            return "This referral record no longer exists.";

        default:
            return error?.message || "Something went wrong. Please try again.";
    }
}


// ============================================================
// FIRESTORE REFERENCES
// ============================================================

function referralsCollection() {

    if (!currentUser) {
        throw new Error("User is not authenticated.");
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
        throw new Error("User is not authenticated.");
    }

    return doc(
        db,
        "users",
        currentUser.uid,
        "referrals",
        id
    );
}


// ============================================================
// LOAD RECORDS
// ============================================================

async function loadRecords() {

    if (!currentUser) return;

    const recordsElement = $("records");

    if (recordsElement) {
        recordsElement.innerHTML =
            `<div class="empty">Loading referral records...</div>`;
    }

    try {

        const q = query(
            referralsCollection(),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        records = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        render();

    } catch (error) {

        console.error("Load referrals error:", error);

        records = [];

        if (recordsElement) {
            recordsElement.innerHTML =
                `<div class="empty">${esc(firebaseErrorMessage(error))}</div>`;
        }
    }
}


// ============================================================
// STATISTICS
// ============================================================

function updateStats() {

    const counts = {
        Pending: 0,
        Referred: 0,
        "Treatment Started": 0,
        Completed: 0
    };

    records.forEach(record => {

        if (
            Object.prototype.hasOwnProperty.call(
                counts,
                record.status
            )
        ) {
            counts[record.status]++;
        }
    });

    if ($("total")) $("total").textContent = records.length;
    if ($("pending")) $("pending").textContent = counts.Pending;
    if ($("referred")) $("referred").textContent = counts.Referred;
    if ($("started")) $("started").textContent = counts["Treatment Started"];
    if ($("completed")) $("completed").textContent = counts.Completed;
}


// ============================================================
// RENDER
// ============================================================

function render() {

    const recordsElement = $("records");

    if (!recordsElement) return;

    const searchValue =
        String($("search")?.value || "")
            .trim()
            .toLowerCase();

    const statusValue =
        $("statusFilter")?.value || "";

    const typeValue =
        $("typeFilter")?.value || "";

    const filtered = records.filter(record => {

        const searchableText = [

            record.childName,
            record.name,
            record.instituteName,
            record.defect,
            record.fatherName,
            record.motherName,
            record.hospitalName,
            record.birthCertificateNo,
            record.mobile1,
            record.mobile2,
            record.mobile3

        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesSearch =
            !searchValue ||
            searchableText.includes(searchValue);

        const matchesStatus =
            !statusValue ||
            record.status === statusValue;

        const recordType =
            record.instituteType ||
            record.type ||
            "";

        const matchesType =
            !typeValue ||
            recordType === typeValue;

        return (
            matchesSearch &&
            matchesStatus &&
            matchesType
        );
    });

    if (!filtered.length) {

        recordsElement.innerHTML =
            `<div class="empty">No referral records found.</div>`;

        updateStats();
        return;
    }

    recordsElement.innerHTML =
        filtered.map(renderRecord).join("");

    updateStats();
}


// ============================================================
// RECORD CARD
// ============================================================

function renderRecord(record) {

    const status = record.status || "Pending";

    let badgeClass = status.toLowerCase();

    if (status === "Treatment Started") {
        badgeClass = "started";
    }

    const type =
        record.instituteType ||
        record.type ||
        "-";

    const name =
        record.childName ||
        record.name ||
        "-";

    const registeredDate =
        record.registeredDate ||
        record.referralDate ||
        "";

    return `

        <article class="record">

            <div class="record-head">

                <div>

                    <div class="record-name">
                        ${esc(name)}
                    </div>

                    <div class="record-meta">
                        ${esc(type)}
                        •
                        ${esc(record.instituteName || "-")}
                        •
                        Registered: ${esc(formatUserDate(registeredDate))}
                    </div>

                </div>

                <span class="badge ${esc(badgeClass)}">
                    ${esc(status)}
                </span>

            </div>


            <div class="record-grid">

                <div>
                    <strong>DEFECT / PROBLEM</strong>
                    ${esc(record.defect || "-")}
                </div>

                <div>
                    <strong>SEX / DOB</strong>
                    ${esc(record.sex || "-")}
                    /
                    ${esc(formatUserDate(record.dob))}
                </div>

                <div>
                    <strong>WEIGHT / HEIGHT</strong>
                    ${esc(record.weight || "-")} kg /
                    ${esc(record.height || "-")} cm
                </div>

                <div>
                    <strong>HOSPITAL</strong>
                    ${esc(record.hospitalName || "-")}
                </div>

            </div>


            <div class="record-actions">

                <button
                    type="button"
                    class="btn light small"
                    onclick="window.viewDetails('${esc(record.id)}')"
                >
                    View Details
                </button>

                <button
                    type="button"
                    class="btn light small"
                    onclick="window.editReferral('${esc(record.id)}')"
                >
                    Edit
                </button>

                <button
                    type="button"
                    class="btn light small"
                    onclick="window.openStatus('${esc(record.id)}')"
                >
                    Update Status
                </button>

                <button
                    type="button"
                    class="btn danger small"
                    onclick="window.openDelete('${esc(record.id)}')"
                >
                    Delete
                </button>

            </div>

        </article>

    `;
}


// ============================================================
// FIND RECORD
// ============================================================

function findRecord(id) {

    return records.find(
        record => record.id === id
    );
}


// ============================================================
// RESET REFERRAL FORM
// ============================================================

function resetReferralForm() {

    const form = $("referralForm");

    if (form) {
        form.reset();
    }

    $("classWrap").hidden = true;
    $("awcWrap").hidden = true;

    $("className").value = "";
    $("awcWorkerNumber").value = "";

    editingReferralId = null;

    $("referralModalTitle").textContent =
        "New Referral";

    $("saveReferralButton").textContent =
        "Save Referral";
}


// ============================================================
// FILL EDIT FORM
// ============================================================

function fillReferralForm(record) {

    $("childName").value =
        record.childName ||
        record.name ||
        "";

    $("sex").value =
        record.sex || "";

    $("dob").value =
        record.dob || "";

    $("birthCertificateNo").value =
        record.birthCertificateNo || "";

    $("fatherName").value =
        record.fatherName || "";

    $("motherName").value =
        record.motherName || "";

    $("weight").value =
        record.weight || "";

    $("height").value =
        record.height || "";

    $("defect").value =
        record.defect || "";

    const type =
        record.instituteType ||
        record.type ||
        "";

    $("instituteType").value = type;

    $("instituteName").value =
        record.instituteName || "";

    $("className").value =
        record.className || "";

    $("awcWorkerNumber").value =
        record.awcWorkerNumber || "";

    $("mobile1").value =
        record.mobile1 || "";

    $("mobile2").value =
        record.mobile2 || "";

    $("mobile3").value =
        record.mobile3 || "";

    $("classWrap").hidden =
        type !== "School";

    $("awcWrap").hidden =
        type !== "AWC";
}


// ============================================================
// NEW REFERRAL
// ============================================================

$("newReferral")?.addEventListener(
    "click",
    () => {

        resetReferralForm();

        show("referralModal");
    }
);


// ============================================================
// EDIT REFERRAL
// ============================================================

window.editReferral = function (id) {

    const record = findRecord(id);

    if (!record) {
        alert("Referral record not found.");
        return;
    }

    editingReferralId = record.id;

    fillReferralForm(record);

    $("referralModalTitle").textContent =
        "Edit Referral";

    $("saveReferralButton").textContent =
        "Save Changes";

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

            location.href = "index.html";
            return;
        }

        const submitButton =
            $("saveReferralButton");

        const instituteType =
            $("instituteType").value;

        const childName =
            value("childName");

        const defect =
            value("defect");

        const instituteName =
            value("instituteName");

        if (!childName) {
            alert("Please enter child name.");
            $("childName").focus();
            return;
        }

        if (!$("sex").value) {
            alert("Please select sex.");
            $("sex").focus();
            return;
        }

        if (!$("dob").value) {
            alert("Please select date of birth.");
            $("dob").focus();
            return;
        }

        if (!defect) {
            alert("Please enter defect / health problem.");
            $("defect").focus();
            return;
        }

        if (!instituteType) {
            alert("Please select institute type.");
            $("instituteType").focus();
            return;
        }

        if (!instituteName) {
            alert("Please enter institute name.");
            $("instituteName").focus();
            return;
        }

        if (submitButton) {

            submitButton.disabled = true;
            submitButton.textContent = "Saving...";
        }

        const referralData = {

            childName,

            sex:
                $("sex").value,

            dob:
                $("dob").value,

            birthCertificateNo:
                value("birthCertificateNo"),

            fatherName:
                value("fatherName"),

            motherName:
                value("motherName"),

            weight:
                value("weight"),

            height:
                value("height"),

            defect,

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
                cleanMobile($("mobile1").value),

            mobile2:
                cleanMobile($("mobile2").value),

            mobile3:
                cleanMobile($("mobile3").value),

            updatedAt:
                serverTimestamp()
        };


        try {

            // ==================================================
            // EDIT EXISTING
            // ==================================================

            if (editingReferralId) {

                await updateDoc(
                    referralDocument(editingReferralId),
                    referralData
                );

                hide("referralModal");

                editingReferralId = null;

                await loadRecords();

                alert(
                    "Referral updated successfully."
                );

            }

            // ==================================================
            // CREATE NEW
            // ==================================================

            else {

                const registrationDate =
                    getTodayInputDate();

                await addDoc(
                    referralsCollection(),
                    {

                        ...referralData,

                        status:
                            "Pending",

                        /*
                            USER SELECTED STATUS DATES

                            New referral automatically starts
                            with today's date as Registration/Pending.

                            User can later change it through
                            Update Status.
                        */

                        registeredDate:
                            registrationDate,

                        referredDate:
                            "",

                        treatmentStartedDate:
                            "",

                        completedDate:
                            "",

                        hospitalName:
                            "",

                        estimatedTreatmentExpenditure:
                            "",

                        /*
                            Old field kept for compatibility
                        */

                        referralDate:
                            registrationDate,

                        createdAt:
                            serverTimestamp()
                    }
                );

                $("referralForm").reset();

                $("classWrap").hidden = true;
                $("awcWrap").hidden = true;

                hide("referralModal");

                await loadRecords();

                alert(
                    "Referral saved successfully."
                );
            }

        } catch (error) {

            alert(
                firebaseErrorMessage(error)
            );

        } finally {

            if (submitButton) {

                submitButton.disabled = false;

                submitButton.textContent =
                    editingReferralId
                        ? "Save Changes"
                        : "Save Referral";
            }
        }
    }
);


// ============================================================
// STATUS MODAL
// ============================================================

window.openStatus = function (id) {

    const record = findRecord(id);

    if (!record) return;

    currentReferralId = record.id;

    $("newStatus").value =
        record.status || "Pending";

    $("hospitalName").value =
        record.hospitalName || "";

    $("estimatedExpenditure").value =
        record.estimatedTreatmentExpenditure ??
        record.estimatedExpenditure ??
        "";

    /*
        Date field is dynamically inserted here.

        Existing date for selected status will be loaded.
    */

    setupStatusDate();

    toggleTreatment();

    show("statusModal");
};


// ============================================================
// STATUS DATE FIELD
// ============================================================

function setupStatusDate() {

    const status =
        $("newStatus")?.value || "Pending";

    const treatmentFields =
        $("treatmentFields");

    if (!treatmentFields) return;

    let dateLabel =
        "Pending / Registration Date";

    let dateId =
        "statusDate";

    if (status === "Referred") {
        dateLabel = "Referred Date";
    }

    if (status === "Treatment Started") {
        dateLabel = "Treatment Started Date";
    }

    if (status === "Completed") {
        dateLabel = "Completed Date";
    }

    let existing =
        $("statusDate");

    if (!existing) {

        const wrapper =
            document.createElement("label");

        wrapper.id =
            "statusDateWrap";

        wrapper.innerHTML = `

            ${dateLabel}

            <input
                type="date"
                id="${dateId}"
                required
            >

        `;

        treatmentFields.parentNode.insertBefore(
            wrapper,
            treatmentFields
        );

    } else {

        existing.parentElement.firstChild.textContent =
            dateLabel;
    }

    const dateInput =
        $("statusDate");

    if (!dateInput) return;

    const record =
        currentReferralId
            ? findRecord(currentReferralId)
            : null;

    let existingDate = "";

    if (record) {

        if (status === "Pending") {
            existingDate =
                record.registeredDate ||
                record.referralDate ||
                "";
        }

        if (status === "Referred") {
            existingDate =
                record.referredDate || "";
        }

        if (status === "Treatment Started") {
            existingDate =
                record.treatmentStartedDate || "";
        }

        if (status === "Completed") {
            existingDate =
                record.completedDate || "";
        }
    }

    dateInput.value =
        existingDate ||
        getTodayInputDate();
}


// ============================================================
// TREATMENT FIELDS
// ============================================================

function toggleTreatment() {

    const status =
        $("newStatus")?.value || "";

    const needsTreatment = [
        "Referred",
        "Treatment Started"
    ].includes(status);

    if ($("treatmentFields")) {
        $("treatmentFields").hidden =
            !needsTreatment;
    }

    if ($("hospitalName")) {
        $("hospitalName").required =
            needsTreatment;
    }

    if ($("estimatedExpenditure")) {
        $("estimatedExpenditure").required =
            needsTreatment;
    }

    setupStatusDate();
}


// ============================================================
// UPDATE STATUS
// ============================================================

$("statusForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        if (!currentReferralId) return;

        if (!currentUser) {

            alert(
                "Your session has expired. Please login again."
            );

            location.href = "index.html";
            return;
        }

        const status =
            $("newStatus").value;

        const selectedDate =
            $("statusDate")?.value || "";

        const hospitalName =
            value("hospitalName");

        const expenditure =
            value("estimatedExpenditure");

        const needsTreatment = [
            "Referred",
            "Treatment Started"
        ].includes(status);


        // ----------------------------------------------------
        // DATE VALIDATION
        // ----------------------------------------------------

        if (!selectedDate) {

            alert(
                "Please select the " +
                status +
                " date."
            );

            $("statusDate")?.focus();

            return;
        }


        // ----------------------------------------------------
        // HOSPITAL VALIDATION
        // ----------------------------------------------------

        if (
            needsTreatment &&
            !hospitalName
        ) {

            alert(
                "Please enter hospital name."
            );

            $("hospitalName").focus();

            return;
        }


        // ----------------------------------------------------
        // EXPENDITURE VALIDATION
        // ----------------------------------------------------

        if (
            needsTreatment &&
            !expenditure
        ) {

            alert(
                "Please enter estimated treatment expenditure."
            );

            $("estimatedExpenditure").focus();

            return;
        }


        const submitButton =
            event.target.querySelector(
                'button[type="submit"]'
            );

        if (submitButton) {

            submitButton.disabled = true;
            submitButton.textContent = "Updating...";
        }


        try {

            const updateData = {

                status,

                updatedAt:
                    serverTimestamp()
            };


            // ------------------------------------------------
            // SAVE DATE ACCORDING TO STATUS
            // ------------------------------------------------

            if (status === "Pending") {

                updateData.registeredDate =
                    selectedDate;

                /*
                    Keep old field compatible.
                */

                updateData.referralDate =
                    selectedDate;
            }


            if (status === "Referred") {

                updateData.referredDate =
                    selectedDate;
            }


            if (status === "Treatment Started") {

                updateData.treatmentStartedDate =
                    selectedDate;
            }


            if (status === "Completed") {

                updateData.completedDate =
                    selectedDate;
            }


            // ------------------------------------------------
            // HOSPITAL + EXPENDITURE
            // ------------------------------------------------

            /*
                IMPORTANT:

                Hospital and expenditure are NOT deleted
                when moving to another status.

                Therefore:

                Referred
                    ↓
                Treatment Started
                    ↓
                Completed

                Previous hospital/expenditure remain saved.
            */

            if (needsTreatment) {

                updateData.hospitalName =
                    hospitalName;

                updateData.estimatedTreatmentExpenditure =
                    expenditure;
            }


            await updateDoc(
                referralDocument(
                    currentReferralId
                ),
                updateData
            );


            hide("statusModal");

            currentReferralId = null;

            await loadRecords();

        } catch (error) {

            alert(
                firebaseErrorMessage(error)
            );

        } finally {

            if (submitButton) {

                submitButton.disabled = false;
                submitButton.textContent = "Update";
            }
        }
    }
);


// ============================================================
// VIEW DETAILS
// ============================================================

window.viewDetails = function (id) {

    const record =
        findRecord(id);

    if (!record) return;

    currentReferralId =
        record.id;

    const childName =
        record.childName ||
        record.name ||
        "-";

    const type =
        record.instituteType ||
        record.type ||
        "-";

    const expenditure =
        record.estimatedTreatmentExpenditure ??
        record.estimatedExpenditure ??
        "";

    $("detailsSubtitle").textContent =
        `${childName} • ${type}`;


    $("detailsContent").innerHTML = `

        <!-- ==========================================
             TIMELINE
        =========================================== -->

        <div class="details-section">

            <h4>
                Referral Timeline
            </h4>

            <div class="details-row">
                <span>📝 Registered / Pending</span>
                <strong>
                    ${esc(
                        formatUserDate(
                            record.registeredDate ||
                            record.referralDate
                        )
                    )}
                </strong>
            </div>

            <div class="details-row">
                <span>📤 Referred</span>
                <strong>
                    ${esc(
                        formatUserDate(
                            record.referredDate
                        )
                    )}
                </strong>
            </div>

            <div class="details-row">
                <span>🏥 Treatment Started</span>
                <strong>
                    ${esc(
                        formatUserDate(
                            record.treatmentStartedDate
                        )
                    )}
                </strong>
            </div>

            <div class="details-row">
                <span>✅ Completed</span>
                <strong>
                    ${esc(
                        formatUserDate(
                            record.completedDate
                        )
                    )}
                </strong>
            </div>

        </div>


        <!-- ==========================================
             CHILD
        =========================================== -->

        <div class="details-grid">

            <div class="details-section">

                <h4>
                    Child Information
                </h4>

                <div class="details-row">
                    <span>Child Name</span>
                    <strong>
                        ${esc(childName)}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Sex</span>
                    <strong>
                        ${esc(record.sex || "-")}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Date of Birth</span>
                    <strong>
                        ${esc(
                            formatUserDate(
                                record.dob
                            )
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Birth Certificate</span>
                    <strong>
                        ${esc(
                            record.birthCertificateNo || "-"
                        )}
                    </strong>
                </div>

            </div>


            <!-- ======================================
                 PARENTS
            ======================================= -->

            <div class="details-section">

                <h4>
                    Parent Information
                </h4>

                <div class="details-row">
                    <span>Father Name</span>
                    <strong>
                        ${esc(
                            record.fatherName || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Mother Name</span>
                    <strong>
                        ${esc(
                            record.motherName || "-"
                        )}
                    </strong>
                </div>

            </div>


            <!-- ======================================
                 HEALTH
            ======================================= -->

            <div class="details-section">

                <h4>
                    Health Information
                </h4>

                <div class="details-row">
                    <span>Defect / Health Problem</span>
                    <strong>
                        ${esc(
                            record.defect || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Weight</span>
                    <strong>
                        ${esc(
                            record.weight || "-"
                        )} kg
                    </strong>
                </div>

                <div class="details-row">
                    <span>Height</span>
                    <strong>
                        ${esc(
                            record.height || "-"
                        )} cm
                    </strong>
                </div>

            </div>


            <!-- ======================================
                 INSTITUTE
            ======================================= -->

            <div class="details-section">

                <h4>
                    Institute Information
                </h4>

                <div class="details-row">
                    <span>Institute Type</span>
                    <strong>
                        ${esc(type)}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Institute Name</span>
                    <strong>
                        ${esc(
                            record.instituteName || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Class</span>
                    <strong>
                        ${esc(
                            record.className || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>AWC Worker Number</span>
                    <strong>
                        ${esc(
                            record.awcWorkerNumber || "-"
                        )}
                    </strong>
                </div>

            </div>


            <!-- ======================================
                 CONTACT
            ======================================= -->

            <div class="details-section">

                <h4>
                    Contact Information
                </h4>

                <div class="details-row">
                    <span>Mobile 1</span>
                    <strong>
                        ${esc(
                            record.mobile1 || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Mobile 2</span>
                    <strong>
                        ${esc(
                            record.mobile2 || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Mobile 3</span>
                    <strong>
                        ${esc(
                            record.mobile3 || "-"
                        )}
                    </strong>
                </div>

            </div>


            <!-- ======================================
                 TREATMENT
            ======================================= -->

            <div class="details-section">

                <h4>
                    Referral / Treatment
                </h4>

                <div class="details-row">
                    <span>Status</span>
                    <strong>
                        ${esc(
                            record.status || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Hospital Name</span>
                    <strong>
                        ${esc(
                            record.hospitalName || "-"
                        )}
                    </strong>
                </div>

                <div class="details-row">
                    <span>Estimated Expenditure</span>
                    <strong>
                        ${
                            expenditure
                                ? "₹ " + esc(expenditure)
                                : "-"
                        }
                    </strong>
                </div>

            </div>

        </div>
    `;

    show("detailsModal");
};


// ============================================================
// EDIT FROM DETAILS
// ============================================================

$("detailsEdit")?.addEventListener(
    "click",
    () => {

        if (!currentReferralId) return;

        const id =
            currentReferralId;

        hide("detailsModal");

        window.editReferral(id);
    }
);


// ============================================================
// DELETE MODAL
// ============================================================

window.openDelete = function (id) {

    const record =
        findRecord(id);

    if (!record) return;

    currentDeleteId =
        record.id;

    const name =
        record.childName ||
        record.name ||
        "this child";

    $("deleteChildName").textContent =
        name;

    show("deleteModal");
};


// ============================================================
// CONFIRM DELETE
// ============================================================

$("confirmDelete")?.addEventListener(
    "click",
    async () => {

        if (!currentDeleteId) return;

        if (!currentUser) {

            alert(
                "Your session has expired. Please login again."
            );

            location.href = "index.html";

            return;
        }

        const deleteButton =
            $("confirmDelete");

        if (deleteButton) {

            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";
        }

        try {

            await deleteDoc(
                referralDocument(
                    currentDeleteId
                )
            );

            hide("deleteModal");

            currentDeleteId = null;

            await loadRecords();

            alert(
                "Referral deleted successfully."
            );

        } catch (error) {

            alert(
                firebaseErrorMessage(error)
            );

        } finally {

            if (deleteButton) {

                deleteButton.disabled = false;
                deleteButton.textContent =
                    "Delete Referral";
            }
        }
    }
);


// ============================================================
// INSTITUTE TYPE
// ============================================================

$("instituteType")?.addEventListener(
    "change",
    event => {

        const type =
            event.target.value;

        $("classWrap").hidden =
            type !== "School";

        $("awcWrap").hidden =
            type !== "AWC";

        if (type !== "School") {
            $("className").value = "";
        }

        if (type !== "AWC") {
            $("awcWorkerNumber").value = "";
        }
    }
);


// ============================================================
// CLOSE BUTTONS
// ============================================================

document
    .querySelectorAll("[data-close]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const modalId =
                    button.dataset.close;

                hide(modalId);

                if (
                    modalId ===
                    "referralModal"
                ) {

                    editingReferralId = null;
                }

                if (
                    modalId ===
                    "statusModal"
                ) {

                    currentReferralId = null;
                }

                if (
                    modalId ===
                    "deleteModal"
                ) {

                    currentDeleteId = null;
                }
            }
        );
    });


// ============================================================
// OUTSIDE MODAL CLICK
// ============================================================

document
    .querySelectorAll(".modal")
    .forEach(modal => {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    hide(modal.id);
                }
            }
        );
    });


// ============================================================
// ESCAPE
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") {
            return;
        }

        document
            .querySelectorAll(".modal.show")
            .forEach(modal => {

                hide(modal.id);
            });
    }
);


// ============================================================
// STATUS CHANGE
// ============================================================

$("newStatus")?.addEventListener(
    "change",
    () => {

        setupStatusDate();
        toggleTreatment();
    }
);


// ============================================================
// SEARCH
// ============================================================

$("search")?.addEventListener(
    "input",
    render
);


// ============================================================
// STATUS FILTER
// ============================================================

$("statusFilter")?.addEventListener(
    "change",
    render
);


// ============================================================
// TYPE FILTER
// ============================================================

$("typeFilter")?.addEventListener(
    "change",
    render
);


// ============================================================
// MOBILE INPUTS
// ============================================================

[
    "mobile1",
    "mobile2",
    "mobile3"
].forEach(id => {

    $(id)?.addEventListener(
        "input",
        function () {

            this.value =
                cleanMobile(
                    this.value
                );
        }
    );
});


// ============================================================
// LOGOUT
// ============================================================

$("logout")?.addEventListener(
    "click",
    async () => {

        try {

            await signOut(auth);

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );
        }

        location.href =
            "index.html";
    }
);


// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            location.href =
                "index.html";

            return;
        }

        currentUser = user;

        const userMobile =
            $("userMobile");

        if (userMobile) {

            const identifier =
                user.email || "";

            const mobile =
                identifier.endsWith(
                    "@rbsk.local"
                )
                    ? identifier.replace(
                        "@rbsk.local",
                        ""
                    )
                    : "";

            userMobile.textContent =
                mobile ||
                user.displayName ||
                "RBSK User";
        }

        await loadRecords();
    }
);
