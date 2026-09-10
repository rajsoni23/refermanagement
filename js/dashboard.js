import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

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
    doc,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


// =========================================================
// FIREBASE INITIALIZATION
// =========================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


// =========================================================
// GLOBAL STATE
// =========================================================

let currentUser = null;

let currentReferralId = null;

let records = [];


// =========================================================
// HELPERS
// =========================================================

const $ = (id) => document.getElementById(id);


function esc(value) {

    return String(value ?? "")
        .replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[char]));

}


function cleanMobile(value) {

    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 10);

}


function show(id) {

    const element = $(id);

    if (!element) return;

    element.classList.add("show");

    element.setAttribute(
        "aria-hidden",
        "false"
    );

}


function hide(id) {

    const element = $(id);

    if (!element) return;

    element.classList.remove("show");

    element.setAttribute(
        "aria-hidden",
        "true"
    );

}


// =========================================================
// DATE FORMAT
// =========================================================

function formatDate(timestamp) {

    if (!timestamp) {
        return "-";
    }

    try {

        let date;

        if (timestamp?.toDate) {
            date = timestamp.toDate();
        } else {
            date = new Date(timestamp);
        }

        if (Number.isNaN(date.getTime())) {
            return "-";
        }

        return date.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

    } catch {

        return "-";

    }

}


// =========================================================
// FIREBASE ERROR
// =========================================================

function firebaseErrorMessage(error) {

    console.error(
        "RBSK Firebase Error:",
        error
    );

    switch (error?.code) {

        case "permission-denied":
            return "Permission denied. Please check Firestore security rules.";

        case "unavailable":
            return "Firebase is temporarily unavailable. Please check your internet connection.";

        case "failed-precondition":
            return "Firestore configuration is incomplete.";

        default:
            return error?.message ||
                "Something went wrong. Please try again.";

    }

}


// =========================================================
// FIRESTORE COLLECTION
// =========================================================

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


// =========================================================
// LOAD REFERRALS
// =========================================================

async function loadRecords() {

    if (!currentUser) {
        return;
    }

    const recordsElement = $("records");

    if (recordsElement) {

        recordsElement.innerHTML =
            `<div class="empty">Loading referral records...</div>`;

    }

    try {

        const referralsRef =
            referralsCollection();

        const q = query(
            referralsRef,
            orderBy(
                "createdAt",
                "desc"
            )
        );

        const snapshot =
            await getDocs(q);

        records = snapshot.docs.map(
            (item) => ({
                id: item.id,
                ...item.data()
            })
        );

        render();

    } catch (error) {

        console.error(
            "Load referrals error:",
            error
        );

        records = [];

        if (recordsElement) {

            recordsElement.innerHTML =
                `<div class="empty">${esc(
                    firebaseErrorMessage(error)
                )}</div>`;

        }

    }

}


// =========================================================
// STATISTICS
// =========================================================

function updateStats() {

    const counts = {

        Pending: 0,

        Referred: 0,

        "Treatment Started": 0,

        Completed: 0

    };


    records.forEach(
        (record) => {

            if (
                Object.prototype.hasOwnProperty.call(
                    counts,
                    record.status
                )
            ) {

                counts[record.status]++;

            }

        }
    );


    if ($("total")) {
        $("total").textContent =
            records.length;
    }

    if ($("pending")) {
        $("pending").textContent =
            counts.Pending;
    }

    if ($("referred")) {
        $("referred").textContent =
            counts.Referred;
    }

    if ($("started")) {
        $("started").textContent =
            counts["Treatment Started"];
    }

    if ($("completed")) {
        $("completed").textContent =
            counts.Completed;
    }

}


// =========================================================
// RENDER RECORDS
// =========================================================

function render() {

    const recordsElement =
        $("records");

    if (!recordsElement) {
        return;
    }


    const searchValue =
        String(
            $("search")?.value || ""
        )
            .trim()
            .toLowerCase();


    const statusValue =
        $("statusFilter")?.value || "";


    const typeValue =
        $("typeFilter")?.value || "";


    const filtered =
        records.filter(
            (record) => {

                const searchableText = [

                    record.childName,

                    record.name,

                    record.instituteName,

                    record.defect,

                    record.fatherName,

                    record.motherName,

                    record.hospitalName,

                    record.birthCertificateNo

                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();


                const matchesSearch =
                    !searchValue ||
                    searchableText.includes(
                        searchValue
                    );


                const matchesStatus =
                    !statusValue ||
                    record.status === statusValue;


                const matchesType =
                    !typeValue ||
                    record.instituteType === typeValue ||
                    record.type === typeValue;


                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesType
                );

            }
        );


    if (!filtered.length) {

        recordsElement.innerHTML =
            `<div class="empty">No referral records found.</div>`;

        updateStats();

        return;

    }


    recordsElement.innerHTML =
        filtered
            .map(
                (record) =>
                    renderRecord(record)
            )
            .join("");


    updateStats();

}


// =========================================================
// RECORD HTML
// =========================================================

function renderRecord(record) {

    const status =
        record.status || "Pending";


    let badgeClass =
        status.toLowerCase();


    if (status === "Treatment Started") {
        badgeClass = "started";
    }


    const instituteType =
        record.instituteType ||
        record.type ||
        "-";


    const childName =
        record.childName ||
        record.name ||
        "-";


    const createdDate =
        formatDate(
            record.createdAt ||
            record.referralDate
        );


    return `

        <article class="record">

            <div class="record-head">

                <div>

                    <div class="record-name">
                        ${esc(childName)}
                    </div>

                    <div class="record-meta">
                        ${esc(instituteType)}
                        •
                        ${esc(record.instituteName || "-")}
                        •
                        ${esc(createdDate)}
                    </div>

                </div>


                <span class="badge ${esc(badgeClass)}">
                    ${esc(status)}
                </span>

            </div>


            <div class="record-grid">

                <div>

                    <strong>
                        DEFECT / PROBLEM
                    </strong>

                    ${esc(record.defect || "-")}

                </div>


                <div>

                    <strong>
                        SEX / DOB
                    </strong>

                    ${esc(record.sex || "-")}
                    /
                    ${esc(record.dob || "-")}

                </div>


                <div>

                    <strong>
                        WEIGHT / HEIGHT
                    </strong>

                    ${esc(record.weight || "-")}
                    kg /
                    ${esc(record.height || "-")}
                    cm

                </div>


                <div>

                    <strong>
                        HOSPITAL
                    </strong>

                    ${esc(record.hospitalName || "-")}

                </div>

            </div>


            <div class="record-actions">

                <button
                    type="button"
                    class="btn light small"
                    onclick="window.openStatus('${esc(record.id)}')"
                >
                    Update Status
                </button>


                <button
                    type="button"
                    class="btn light small"
                    onclick="window.viewDetails('${esc(record.id)}')"
                >
                    View Details
                </button>

            </div>

        </article>

    `;

}


// =========================================================
// FIND RECORD
// =========================================================

function findRecord(id) {

    return records.find(
        (record) =>
            record.id === id
    );

}


// =========================================================
// OPEN STATUS MODAL
// =========================================================

window.openStatus = function (id) {

    const record =
        findRecord(id);

    if (!record) {
        return;
    }


    currentReferralId =
        record.id;


    $("newStatus").value =
        record.status || "Pending";


    $("hospitalName").value =
        record.hospitalName || "";


    $("estimatedExpenditure").value =
        record.estimatedTreatmentExpenditure ??
        record.estimatedExpenditure ??
        "";


    toggleTreatment();

    show("statusModal");

};


// =========================================================
// VIEW DETAILS
// =========================================================

window.viewDetails = function (id) {

    const record =
        findRecord(id);

    if (!record) {
        return;
    }


    const childName =
        record.childName ||
        record.name ||
        "-";


    const instituteType =
        record.instituteType ||
        record.type ||
        "-";


    const expenditure =
        record.estimatedTreatmentExpenditure ??
        record.estimatedExpenditure ??
        "";


    alert(

`Child: ${childName}

Sex: ${record.sex || "-"}

DOB: ${record.dob || "-"}

Birth Certificate: ${record.birthCertificateNo || "-"}

Father: ${record.fatherName || "-"}

Mother: ${record.motherName || "-"}

Defect / Health Problem: ${record.defect || "-"}

Weight: ${record.weight || "-"} kg

Height: ${record.height || "-"} cm

Institute: ${instituteType} - ${record.instituteName || "-"}

Class: ${record.className || "-"}

AWC Worker: ${record.awcWorkerNumber || "-"}

Hospital: ${record.hospitalName || "-"}

Estimated Treatment Expenditure: ${
    expenditure
        ? "₹ " + expenditure
        : "-"
}

Mobile 1: ${record.mobile1 || "-"}

Mobile 2: ${record.mobile2 || "-"}

Mobile 3: ${record.mobile3 || "-"}

Status: ${record.status || "-"}`

    );

};


// =========================================================
// TREATMENT FIELDS
// =========================================================

function toggleTreatment() {

    const status =
        $("newStatus")?.value || "";


    const showTreatment =
        [
            "Referred",
            "Treatment Started"
        ].includes(status);


    const treatmentFields =
        $("treatmentFields");


    if (treatmentFields) {

        treatmentFields.hidden =
            !showTreatment;

    }


    if ($("hospitalName")) {

        $("hospitalName").required =
            showTreatment;

    }


    if ($("estimatedExpenditure")) {

        $("estimatedExpenditure").required =
            showTreatment;

    }

}


// =========================================================
// OPEN NEW REFERRAL
// =========================================================

$("newReferral")?.addEventListener(
    "click",
    () => {

        show("referralModal");

    }
);


// =========================================================
// CLOSE MODALS
// =========================================================

document
    .querySelectorAll("[data-close]")
    .forEach(
        (button) => {

            button.addEventListener(
                "click",
                () => {

                    hide(
                        button.dataset.close
                    );

                }
            );

        }
    );


// =========================================================
// CLICK OUTSIDE MODAL TO CLOSE
// =========================================================

document
    .querySelectorAll(".modal")
    .forEach(
        (modal) => {

            modal.addEventListener(
                "click",
                (event) => {

                    if (
                        event.target === modal
                    ) {

                        hide(
                            modal.id
                        );

                    }

                }
            );

        }
    );


// =========================================================
// ESC KEY — CLOSE MODAL
// =========================================================

document.addEventListener(
    "keydown",
    (event) => {

        if (event.key !== "Escape") {
            return;
        }


        document
            .querySelectorAll(".modal.show")
            .forEach(
                (modal) => {

                    hide(
                        modal.id
                    );

                }
            );

    }
);


// =========================================================
// STATUS CHANGE
// =========================================================

$("newStatus")?.addEventListener(
    "change",
    toggleTreatment
);


// =========================================================
// SAVE NEW REFERRAL
// =========================================================

$("referralForm")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (!currentUser) {

            alert(
                "Your session has expired. Please login again."
            );

            location.href =
                "index.html";

            return;

        }


        const form =
            event.target;


        const submitButton =
            form.querySelector(
                'button[type="submit"]'
            );


        const value = (id) =>
            String(
                $(id)?.value || ""
            ).trim();


        const instituteType =
            $("instituteType").value;


        const childName =
            value("childName");


        const defect =
            value("defect");


        const instituteName =
            value("instituteName");


        if (!childName) {

            alert(
                "Please enter child name."
            );

            $("childName")?.focus();

            return;

        }


        if (!defect) {

            alert(
                "Please enter defect / health problem."
            );

            $("defect")?.focus();

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


        const referral = {

            childName,

            sex: $("sex").value,

            birthCertificateNo:
                value(
                    "birthCertificateNo"
                ),

            fatherName:
                value(
                    "fatherName"
                ),

            motherName:
                value(
                    "motherName"
                ),

            dob:
                $("dob").value,

            weight:
                value(
                    "weight"
                ),

            height:
                value(
                    "height"
                ),

            defect,

            instituteType,

            instituteName,

            className:
                instituteType === "School"
                    ? value("className")
                    : "",

            awcWorkerNumber:
                instituteType === "AWC"
                    ? value(
                        "awcWorkerNumber"
                    )
                    : "",

            mobile1:
                cleanMobile(
                    $("mobile1").value
                ),

            mobile2:
                cleanMobile(
                    $("mobile2").value
                ),

            mobile3:
                cleanMobile(
                    $("mobile3").value
                ),

            status: "Pending",

            hospitalName: "",

            estimatedTreatmentExpenditure:
                "",

            referralDate:
                new Date()
                    .toISOString()
                    .split("T")[0],

            createdAt:
                serverTimestamp(),

            updatedAt:
                serverTimestamp()

        };


        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Saving...";

        }


        try {

            await addDoc(
                referralsCollection(),
                referral
            );


            form.reset();


            $("classWrap").hidden =
                true;


            $("awcWrap").hidden =
                true;


            hide("referralModal");


            await loadRecords();


            alert(
                "Referral saved successfully."
            );


        } catch (error) {

            alert(
                firebaseErrorMessage(
                    error
                )
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Save Referral";

            }

        }

    }
);


// =========================================================
// UPDATE REFERRAL STATUS
// =========================================================

$("statusForm")?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        if (!currentReferralId) {
            return;
        }


        if (!currentUser) {

            alert(
                "Your session has expired. Please login again."
            );

            location.href =
                "index.html";

            return;

        }


        const status =
            $("newStatus").value;


        const hospitalName =
            String(
                $("hospitalName").value || ""
            ).trim();


        const expenditure =
            String(
                $("estimatedExpenditure").value || ""
            ).trim();


        const needsTreatmentDetails =
            [
                "Referred",
                "Treatment Started"
            ].includes(status);


        if (
            needsTreatmentDetails &&
            !hospitalName
        ) {

            alert(
                "Please enter hospital name."
            );

            $("hospitalName").focus();

            return;

        }


        if (
            needsTreatmentDetails &&
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

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Updating...";

        }


        try {

            const referralRef =
                doc(
                    db,
                    "users",
                    currentUser.uid,
                    "referrals",
                    currentReferralId
                );


            const updateData = {

                status,

                updatedAt:
                    serverTimestamp()

            };


            /*
             * Hospital and expenditure are intentionally
             * preserved when moving to another status.
             */

            if (needsTreatmentDetails) {

                updateData.hospitalName =
                    hospitalName;

                updateData.estimatedTreatmentExpenditure =
                    expenditure;

            }


            await updateDoc(
                referralRef,
                updateData
            );


            hide("statusModal");


            currentReferralId =
                null;


            await loadRecords();


        } catch (error) {

            alert(
                firebaseErrorMessage(
                    error
                )
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    "Update";

            }

        }

    }
);


// =========================================================
// INSTITUTE TYPE
// =========================================================

$("instituteType")?.addEventListener(
    "change",
    (event) => {

        const type =
            event.target.value;


        $("classWrap").hidden =
            type !== "School";


        $("awcWrap").hidden =
            type !== "AWC";


        if (type !== "School") {

            $("className").value =
                "";

        }


        if (type !== "AWC") {

            $("awcWorkerNumber").value =
                "";

        }

    }
);


// =========================================================
// SEARCH / FILTERS
// =========================================================

$("search")?.addEventListener(
    "input",
    render
);


$("statusFilter")?.addEventListener(
    "change",
    render
);


$("typeFilter")?.addEventListener(
    "change",
    render
);


// =========================================================
// MOBILE INPUTS
// =========================================================

[
    "mobile1",
    "mobile2",
    "mobile3"
].forEach(
    (id) => {

        $(id)?.addEventListener(
            "input",
            function () {

                this.value =
                    cleanMobile(
                        this.value
                    );

            }
        );

    }
);


// =========================================================
// LOGOUT
// =========================================================

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


// =========================================================
// AUTHENTICATION
// =========================================================

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            location.href =
                "index.html";

            return;

        }


        currentUser =
            user;


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
