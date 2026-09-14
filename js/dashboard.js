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


// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


// =====================================================
// GLOBAL VARIABLES
// =====================================================

let currentUser = null;

let currentReferralId = null;

let currentDeleteId = null;

let editingReferralId = null;

let records = [];


// =====================================================
// HELPERS
// =====================================================

const $ = (id) => document.getElementById(id);


const esc = (value) => {

    return String(value ?? "").replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[character])
    );

};


const value = (id) => {

    return String($(id)?.value || "").trim();

};


const cleanMobile = (value) => {

    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 10);

};


const cleanAadhaar = (value) => {

    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 12);

};


// =====================================================
// MODALS
// =====================================================

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


// =====================================================
// DATE HELPERS
// =====================================================

function today() {

    const date = new Date();

    return `${date.getFullYear()}-${String(
        date.getMonth() + 1
    ).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;

}


function formatDate(value) {

    if (!value) return "-";

    const stringValue = String(value);

    if (
        /^\d{4}-\d{2}-\d{2}$/.test(
            stringValue
        )
    ) {

        const [
            year,
            month,
            day
        ] = stringValue.split("-");

        return `${day}/${month}/${year}`;

    }

    return stringValue;

}


// =====================================================
// FIREBASE ERROR
// =====================================================

function firebaseErrorMessage(error) {

    console.error(error);

    if (
        error?.code ===
        "permission-denied"
    ) {

        return "Permission denied. Please check Firebase Firestore Rules.";

    }

    return (
        error?.message ||
        "Something went wrong. Please try again."
    );

}


// =====================================================
// FIRESTORE REFERENCES
// =====================================================

function referralsCollection() {

    if (!currentUser) {

        throw new Error(
            "User is not authenticated."
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
            "User is not authenticated."
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


// =====================================================
// DEFECT SELECTION
// =====================================================

function selectedDefects() {

    const selected = [
        ...document.querySelectorAll(
            '#defectList input[type="checkbox"]:checked'
        )
    ].map(
        checkbox => checkbox.value
    );

    const otherCheckbox =
        $("otherDefectCheckbox");

    const otherInput =
        $("otherDefect");

    if (
        otherCheckbox?.checked &&
        otherInput?.value.trim()
    ) {

        return [
            ...selected.filter(
                item =>
                    item !==
                    "Other Health Condition"
            ),
            `Other Health Condition - ${otherInput.value.trim()}`
        ];

    }

    return selected;

}


// =====================================================
// SET DEFECTS
// =====================================================

function setSelectedDefects(defects) {

    document
        .querySelectorAll(
            '#defectList input[type="checkbox"]'
        )
        .forEach(
            checkbox => {
                checkbox.checked = false;
            }
        );


    if ($("otherDefect")) {

        $("otherDefect").value = "";

    }


    (
        Array.isArray(defects)
            ? defects
            : []
    ).forEach(defect => {

        const text =
            String(defect || "");


        if (
            text.startsWith(
                "Other Health Condition - "
            )
        ) {

            if ($("otherDefectCheckbox")) {

                $("otherDefectCheckbox").checked =
                    true;

            }

            if ($("otherDefect")) {

                $("otherDefect").value =
                    text.replace(
                        "Other Health Condition - ",
                        ""
                    );

            }

            return;
        }


        const checkbox = [
            ...document.querySelectorAll(
                '#defectList input[type="checkbox"]'
            )
        ].find(
            item =>
                item.value === text
        );


        if (checkbox) {

            checkbox.checked = true;

        }

    });


    updateOtherDefectVisibility();

}


// =====================================================
// OTHER DEFECT BOX
// =====================================================

function updateOtherDefectVisibility() {

    const checkbox =
        $("otherDefectCheckbox");

    const box =
        $("otherDefectBox");

    if (!box) return;

    const visible =
        checkbox?.checked === true;

    box.classList.toggle(
        "hidden",
        !visible
    );


    if (
        !visible &&
        $("otherDefect")
    ) {

        $("otherDefect").value = "";

    }

}


// =====================================================
// LOAD RECORDS
// =====================================================

async function loadRecords() {

    if (!currentUser) return;


    $("records").innerHTML =
        '<div class="empty">Loading referral records...</div>';


    try {

        const q = query(
            referralsCollection(),
            orderBy(
                "createdAt",
                "desc"
            )
        );


        const snapshot =
            await getDocs(q);


        records =
            snapshot.docs.map(
                item => ({
                    id: item.id,
                    ...item.data()
                })
            );


        render();


    } catch (error) {

        console.error(
            "Load records error:",
            error
        );


        records = [];


        $("records").innerHTML =
            `<div class="empty">
                ${esc(
                    firebaseErrorMessage(error)
                )}
            </div>`;

    }

}


// =====================================================
// UPDATE STATS
// =====================================================

function updateStats() {

    const counts = {

        Pending: 0,

        Referred: 0,

        "Treatment Started": 0,

        Completed: 0

    };


    records.forEach(record => {

        if (
            counts[
                record.status
            ] !== undefined
        ) {

            counts[
                record.status
            ]++;

        }

    });


    $("total").textContent =
        records.length;


    $("pending").textContent =
        counts.Pending;


    $("referred").textContent =
        counts.Referred;


    $("started").textContent =
        counts["Treatment Started"];


    $("completed").textContent =
        counts.Completed;

}


// =====================================================
// RENDER RECORDS
// =====================================================

function render() {

    const search =
        value("search").toLowerCase();


    const statusFilter =
        $("statusFilter")?.value || "";


    const typeFilter =
        $("typeFilter")?.value || "";


    const filtered =
        records.filter(record => {

            const searchable = [

                record.childName,

                record.instituteName,

                record.defect,

                record.defects?.join(" "),

                record.fatherName,

                record.motherName,

                record.villageName,

                record.hospitalName,

                record.birthCertificateNo,

                record.mobile1,

                record.mobile2,

                record.mobile3

            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();


            const searchMatch =
                !search ||
                searchable.includes(search);


            const statusMatch =
                !statusFilter ||
                record.status ===
                    statusFilter;


            const typeMatch =
                !typeFilter ||
                (
                    record.instituteType ||
                    record.type ||
                    ""
                ) === typeFilter;


            return (
                searchMatch &&
                statusMatch &&
                typeMatch
            );

        });


    $("records").innerHTML =
        filtered.length
            ? filtered
                .map(renderRecord)
                .join("")
            : '<div class="empty">No referral records found.</div>';


    updateStats();

}


// =====================================================
// RENDER SINGLE RECORD
// =====================================================

function renderRecord(record) {

    const status =
        record.status ||
        "Pending";


    const badgeClass =
        status === "Treatment Started"
            ? "started"
            : status.toLowerCase();


    const name =
        record.childName ||
        record.name ||
        "-";


    const type =
        record.instituteType ||
        record.type ||
        "-";


    const defects =
        record.defects?.length
            ? record.defects.join(", ")
            : record.defect ||
              "-";


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
                        ${esc(
                            record.instituteName ||
                            "-"
                        )}

                        • Registered:

                        ${esc(
                            formatDate(
                                record.registeredDate ||
                                record.referralDate
                            )
                        )}

                    </div>

                </div>


                <span class="badge ${esc(
                    badgeClass
                )}">

                    ${esc(status)}

                </span>

            </div>


            <div class="record-grid">

                <div>

                    <strong>
                        DEFECT / PROBLEM
                    </strong>

                    ${esc(defects)}

                </div>


                <div>

                    <strong>
                        SEX / DOB
                    </strong>

                    ${esc(
                        record.sex || "-"
                    )}

                    /

                    ${esc(
                        formatDate(
                            record.dob
                        )
                    )}

                </div>


                <div>

                    <strong>
                        WEIGHT / HEIGHT
                    </strong>

                    ${esc(
                        record.weight || "-"
                    )}

                    kg /

                    ${esc(
                        record.height || "-"
                    )}

                    cm

                </div>


                <div>

                    <strong>
                        VILLAGE
                    </strong>

                    ${esc(
                        record.villageName ||
                        "-"
                    )}

                </div>


                <div>

                    <strong>
                        HOSPITAL
                    </strong>

                    ${esc(
                        record.privateHospital ===
                            "Other"
                            ? (
                                record.otherHospitalName ||
                                "-"
                            )
                            : (
                                record.privateHospital ||
                                record.hospitalName ||
                                "-"
                            )
                    )}

                </div>


                <div>

                    <strong>
                        STATUS
                    </strong>

                    ${esc(status)}

                </div>

            </div>


            <div class="record-actions">

                <button
                    class="btn light small"
                    onclick="window.viewDetails('${esc(record.id)}')"
                >
                    View Details
                </button>


                <button
                    class="btn light small"
                    onclick="window.editReferral('${esc(record.id)}')"
                >
                    Edit
                </button>


                <button
                    class="btn light small"
                    onclick="window.openStatus('${esc(record.id)}')"
                >
                    Update Status
                </button>


                <button
                    class="btn danger small"
                    onclick="window.openDelete('${esc(record.id)}')"
                >
                    Delete
                </button>

            </div>

        </article>

    `;

}


// =====================================================
// FIND RECORD
// =====================================================

function findRecord(id) {

    return records.find(
        record =>
            record.id === id
    );

}


// =====================================================
// RESET FORM
// =====================================================

function resetReferralForm() {

    $("referralForm")?.reset();


    if ($("classWrap")) {

        $("classWrap").hidden =
            true;

    }


    if ($("awcWrap")) {

        $("awcWrap").hidden =
            true;

    }


    if ($("otherDefectBox")) {

        $("otherDefectBox")
            .classList
            .add("hidden");

    }


    if ($("className")) {

        $("className").value = "";

    }


    if ($("awcWorkerNumber")) {

        $("awcWorkerNumber").value = "";

    }


    if ($("mobile3Label")) {

        $("mobile3Label").textContent =
            "Mobile 3";

    }


    editingReferralId = null;


    $("referralModalTitle").textContent =
        "New Referral";


    $("saveReferralButton").textContent =
        "Save Referral";

}


// =====================================================
// FILL EDIT FORM
// =====================================================

function fillReferralForm(record) {

    $("childName").value =
        record.childName ||
        record.name ||
        "";


    $("sex").value =
        record.sex ||
        "";


    $("dob").value =
        record.dob ||
        "";


    $("birthCertificateNo").value =
        record.birthCertificateNo ||
        "";


    $("fatherName").value =
        record.fatherName ||
        "";


    $("fatherAadhaar").value =
        record.fatherAadhaar ||
        "";


    $("motherName").value =
        record.motherName ||
        "";


    $("motherAadhaar").value =
        record.motherAadhaar ||
        "";


    $("villageName").value =
        record.villageName ||
        "";


    $("weight").value =
        record.weight ||
        "";


    $("height").value =
        record.height ||
        "";


    setSelectedDefects(
        record.defects?.length
            ? record.defects
            : (
                record.defect
                    ? [record.defect]
                    : []
            )
    );


    const type =
        record.instituteType ||
        record.type ||
        "";


    $("instituteType").value =
        type;


    $("instituteName").value =
        record.instituteName ||
        "";


    $("className").value =
        record.className ||
        "";


    $("awcWorkerNumber").value =
        record.awcWorkerNumber ||
        "";


    $("mobile1").value =
        record.mobile1 ||
        "";


    $("mobile2").value =
        record.mobile2 ||
        "";


    $("mobile3").value =
        record.mobile3 ||
        "";


    updateInstituteFields(type);

}


// =====================================================
// INSTITUTE FIELDS
// =====================================================

function updateInstituteFields(type) {

    if ($("classWrap")) {

        $("classWrap").hidden =
            type !== "School";

    }


    if ($("awcWrap")) {

        $("awcWrap").hidden =
            type !== "AWC";

    }


    if ($("mobile3Label")) {

        $("mobile3Label").textContent =
            type === "School"
                ? "School Principal Mobile Number"
                : type === "AWC"
                    ? "AWC Worker Mobile Number"
                    : "Mobile 3";

    }


    if (
        type !== "School" &&
        $("className")
    ) {

        $("className").value = "";

    }


    if (
        type !== "AWC" &&
        $("awcWorkerNumber")
    ) {

        $("awcWorkerNumber").value = "";

    }

}


// =====================================================
// NEW REFERRAL
// =====================================================

$("newReferral")?.addEventListener(
    "click",
    () => {

        resetReferralForm();

        show("referralModal");

    }
);


// =====================================================
// EDIT REFERRAL
// =====================================================

window.editReferral = id => {

    const record =
        findRecord(id);


    if (!record) {

        alert(
            "Referral record not found."
        );

        return;

    }


    editingReferralId =
        record.id;


    fillReferralForm(
        record
    );


    $("referralModalTitle").textContent =
        "Edit Referral";


    $("saveReferralButton").textContent =
        "Save Changes";


    hide("detailsModal");

    show("referralModal");

};


// =====================================================
// SAVE REFERRAL
// =====================================================

$("referralForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        if (!currentUser) {

            alert(
                "Your session has expired. Please login again."
            );

            return;

        }


        const button =
            $("saveReferralButton");


        const type =
            value("instituteType");


        const child =
            value("childName");


        const institute =
            value("instituteName");


        const defects =
            selectedDefects();


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (!child) {

            alert(
                "Please enter child name."
            );

            return;

        }


        if (!$("sex").value) {

            alert(
                "Please select sex."
            );

            return;

        }


        if (!$("dob").value) {

            alert(
                "Please select date of birth."
            );

            return;

        }


        if (!defects.length) {

            alert(
                "Please select at least one defect / health condition."
            );

            return;

        }


        if (!type) {

            alert(
                "Please select institute type."
            );

            return;

        }


        if (!institute) {

            alert(
                "Please enter institute name."
            );

            return;

        }


        if (button) {

            button.disabled = true;

            button.textContent =
                "Saving...";

        }


        // -------------------------------------------------
        // DATA
        // -------------------------------------------------

        const data = {

            childName:
                child,

            sex:
                value("sex"),

            dob:
                value("dob"),

            birthCertificateNo:
                value(
                    "birthCertificateNo"
                ),

            fatherName:
                value("fatherName"),

            fatherAadhaar:
                cleanAadhaar(
                    value("fatherAadhaar")
                ),

            motherName:
                value("motherName"),

            motherAadhaar:
                cleanAadhaar(
                    value("motherAadhaar")
                ),

            villageName:
                value("villageName"),

            weight:
                value("weight"),

            height:
                value("height"),

            defects:

                defects,

            defect:

                defects.join(", "),

            instituteType:

                type,

            instituteName:

                institute,

            className:

                type === "School"
                    ? value("className")
                    : "",

            awcWorkerNumber:

                type === "AWC"
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


        // -------------------------------------------------
        // SAVE / UPDATE
        // -------------------------------------------------

        try {

            if (editingReferralId) {

                await updateDoc(
                    referralDocument(
                        editingReferralId
                    ),
                    data
                );


                hide(
                    "referralModal"
                );


                editingReferralId =
                    null;


                await loadRecords();


                alert(
                    "Referral updated successfully."
                );


            } else {

                const registrationDate =
                    today();


                await addDoc(
                    referralsCollection(),
                    {

                        ...data,

                        status:
                            "Pending",

                        registeredDate:
                            registrationDate,

                        referredDate:
                            "",

                        treatmentStartedDate:
                            "",

                        completedDate:
                            "",

                        referralDate:
                            registrationDate,

                        referType:
                            "",

                        privateHospital:
                            "",

                        otherHospitalName:
                            "",

                        hospitalName:
                            "",

                        estimatedTreatmentExpenditure:
                            "",

                        createdAt:
                            serverTimestamp()

                    }
                );


                resetReferralForm();


                hide(
                    "referralModal"
                );


                await loadRecords();


                alert(
                    "Referral saved successfully."
                );

            }


        } catch (error) {

            alert(
                firebaseErrorMessage(
                    error
                )
            );


        } finally {

            if (button) {

                button.disabled = false;

                button.textContent =
                    editingReferralId
                        ? "Save Changes"
                        : "Save Referral";

            }

        }

    }
);


// =====================================================
// DEFECT CHANGE
// =====================================================

$("otherDefectCheckbox")
    ?.addEventListener(
        "change",
        updateOtherDefectVisibility
    );


// =====================================================
// INSTITUTE CHANGE
// =====================================================

$("instituteType")
    ?.addEventListener(
        "change",
        event => {

            updateInstituteFields(
                event.target.value
            );

        }
    );


// =====================================================
// STATUS MODAL
// =====================================================

window.openStatus = id => {

    const record =
        findRecord(id);


    if (!record) {

        alert(
            "Referral record not found."
        );

        return;

    }


    currentReferralId =
        id;


    $("newStatus").value =
        record.status ||
        "Pending";


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
        record.estimatedTreatmentExpenditure ||
        "";


    updateReferralTypeUI();

    toggleTreatment();

    show("statusModal");

};


// =====================================================
// REFERRAL TYPE UI
// =====================================================

function updateReferralTypeUI() {

    const referType =
        $("referType")?.value || "";


    const privateHospitalVisible =
        referType ===
        "Private Hospital";


    if ($("privateHospitalWrap")) {

        $("privateHospitalWrap").hidden =
            !privateHospitalVisible;

    }


    if ($("otherHospitalWrap")) {

        $("otherHospitalWrap").hidden =
            !privateHospitalVisible ||
            $("privateHospital")?.value !==
                "Other";

    }

}


// =====================================================
// TREATMENT UI
// =====================================================

function toggleTreatment() {

    const status =
        $("newStatus")?.value || "Pending";


    const needsTreatment =
        [
            "Referred",
            "Treatment Started",
            "Completed"
        ].includes(status);


    if ($("referTypeWrap")) {

        $("referTypeWrap").hidden =
            !needsTreatment;

    }


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


    updateReferralTypeUI();

}


// =====================================================
// STATUS EVENTS
// =====================================================

$("referType")
    ?.addEventListener(
        "change",
        updateReferralTypeUI
    );


$("privateHospital")
    ?.addEventListener(
        "change",
        updateReferralTypeUI
    );


$("newStatus")
    ?.addEventListener(
        "change",
        toggleTreatment
    );


// =====================================================
// SAVE STATUS
// =====================================================

$("statusForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        if (
            !currentReferralId ||
            !currentUser
        ) {

            return;

        }


        const status =
            $("newStatus").value;


        const needsTreatment =
            [
                "Referred",
                "Treatment Started",
                "Completed"
            ].includes(status);


        const referType =
            $("referType").value;


        const privateHospital =
            $("privateHospital").value;


        const otherHospital =
            value(
                "otherHospitalName"
            );


        const hospital =
            value(
                "hospitalName"
            );


        const expenditure =
            value(
                "estimatedExpenditure"
            );


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (
            needsTreatment &&
            !referType
        ) {

            alert(
                "Please select Refer Type."
            );

            return;

        }


        if (
            needsTreatment &&
            referType ===
                "Private Hospital" &&
            !privateHospital
        ) {

            alert(
                "Please select private hospital."
            );

            return;

        }


        if (
            needsTreatment &&
            referType ===
                "Private Hospital" &&
            privateHospital ===
                "Other" &&
            !otherHospital
        ) {

            alert(
                "Please enter hospital name."
            );

            return;

        }


        if (
            needsTreatment &&
            !hospital
        ) {

            alert(
                "Please enter hospital name."
            );

            return;

        }


        if (
            needsTreatment &&
            !expenditure
        ) {

            alert(
                "Please enter estimated treatment expenditure."
            );

            return;

        }


        const button =
            event.target.querySelector(
                'button[type="submit"]'
            );


        if (button) {

            button.disabled = true;

            button.textContent =
                "Updating...";

        }


        try {

            const data = {

                status:

                    status,

                updatedAt:

                    serverTimestamp(),

                referType:

                    needsTreatment
                        ? referType
                        : "",

                privateHospital:

                    needsTreatment &&
                    referType ===
                        "Private Hospital"
                        ? privateHospital
                        : "",

                otherHospitalName:

                    needsTreatment &&
                    referType ===
                        "Private Hospital" &&
                    privateHospital ===
                        "Other"
                        ? otherHospital
                        : "",

                hospitalName:

                    needsTreatment
                        ? hospital
                        : "",

                estimatedTreatmentExpenditure:

                    needsTreatment
                        ? expenditure
                        : ""

            };


            if (
                status ===
                "Pending"
            ) {

                data.registeredDate =
                    today();

            }


            if (
                status ===
                "Referred"
            ) {

                data.referredDate =
                    today();

            }


            if (
                status ===
                "Treatment Started"
            ) {

                data.treatmentStartedDate =
                    today();

            }


            if (
                status ===
                "Completed"
            ) {

                data.completedDate =
                    today();

            }


            await updateDoc(
                referralDocument(
                    currentReferralId
                ),
                data
            );


            hide(
                "statusModal"
            );


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

            if (button) {

                button.disabled = false;

                button.textContent =
                    "Update";

            }

        }

    }
);


// =====================================================
// VIEW DETAILS
// =====================================================

window.viewDetails = id => {

    const record =
        findRecord(id);


    if (!record) return;


    currentReferralId =
        id;


    const defects =
        record.defects?.length
            ? record.defects.join(", ")
            : record.defect ||
              "-";


    const privateHospital =
        record.privateHospital ===
            "Other"
            ? record.otherHospitalName
            : record.privateHospital;


    $("detailsSubtitle").textContent =
        `${record.childName || record.name || "-"} • ${
            record.instituteType ||
            record.type ||
            "-"
        }`;


    $("detailsContent").innerHTML = `

        <div class="details-section">

            <h4>
                Child Information
            </h4>


            <div class="details-row">
                <span>Child Name</span>
                <strong>
                    ${esc(
                        record.childName ||
                        record.name ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Sex</span>
                <strong>
                    ${esc(
                        record.sex ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Date of Birth</span>
                <strong>
                    ${esc(
                        formatDate(
                            record.dob
                        )
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Birth Certificate</span>
                <strong>
                    ${esc(
                        record.birthCertificateNo ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Village</span>
                <strong>
                    ${esc(
                        record.villageName ||
                        "-"
                    )}
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Parent Information
            </h4>


            <div class="details-row">
                <span>Father Name</span>
                <strong>
                    ${esc(
                        record.fatherName ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Father Aadhaar</span>
                <strong>
                    ${esc(
                        record.fatherAadhaar ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Mother Name</span>
                <strong>
                    ${esc(
                        record.motherName ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Mother Aadhaar</span>
                <strong>
                    ${esc(
                        record.motherAadhaar ||
                        "-"
                    )}
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Health Information
            </h4>


            <div class="details-row">
                <span>
                    Defect / Health Condition
                </span>

                <strong>
                    ${esc(defects)}
                </strong>
            </div>


            <div class="details-row">
                <span>Weight</span>
                <strong>
                    ${esc(
                        record.weight ||
                        "-"
                    )}
                    kg
                </strong>
            </div>


            <div class="details-row">
                <span>Height</span>
                <strong>
                    ${esc(
                        record.height ||
                        "-"
                    )}
                    cm
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Institute Information
            </h4>


            <div class="details-row">
                <span>Institute Type</span>
                <strong>
                    ${esc(
                        record.instituteType ||
                        record.type ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Institute Name</span>
                <strong>
                    ${esc(
                        record.instituteName ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Class</span>
                <strong>
                    ${esc(
                        record.className ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>AWC Worker Number</span>
                <strong>
                    ${esc(
                        record.awcWorkerNumber ||
                        "-"
                    )}
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Contact Information
            </h4>


            <div class="details-row">
                <span>Mobile 1</span>
                <strong>
                    ${esc(
                        record.mobile1 ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Mobile 2</span>
                <strong>
                    ${esc(
                        record.mobile2 ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>
                    ${
                        record.instituteType ===
                            "School"
                            ? "School Principal Mobile Number"
                            : record.instituteType ===
                                "AWC"
                                ? "AWC Worker Mobile Number"
                                : "Mobile 3"
                    }
                </span>

                <strong>
                    ${esc(
                        record.mobile3 ||
                        "-"
                    )}
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Referral / Treatment
            </h4>


            <div class="details-row">
                <span>Status</span>
                <strong>
                    ${esc(
                        record.status ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Refer Type</span>
                <strong>
                    ${esc(
                        record.referType ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>Hospital</span>
                <strong>
                    ${esc(
                        privateHospital ||
                        record.hospitalName ||
                        "-"
                    )}
                </strong>
            </div>


            <div class="details-row">
                <span>
                    Estimated Expenditure
                </span>

                <strong>
                    ${
                        record.estimatedTreatmentExpenditure
                            ? "₹ " +
                              esc(
                                  record.estimatedTreatmentExpenditure
                              )
                            : "-"
                    }
                </strong>
            </div>

        </div>


        <div class="details-section">

            <h4>
                Documents / Attachments
            </h4>

            <div class="empty">
                File upload is currently disabled.
            </div>

        </div>

    `;


    show("detailsModal");

};


// =====================================================
// DETAILS → EDIT
// =====================================================

$("detailsEdit")
    ?.addEventListener(
        "click",
        () => {

            if (!currentReferralId)
                return;


            const id =
                currentReferralId;


            hide("detailsModal");


            window.editReferral(
                id
            );

        }
    );


// =====================================================
// DELETE MODAL
// =====================================================

window.openDelete = id => {

    const record =
        findRecord(id);


    if (!record) return;


    currentDeleteId =
        id;


    $("deleteChildName").textContent =
        record.childName ||
        record.name ||
        "this child";


    show("deleteModal");

};


// =====================================================
// CONFIRM DELETE
// =====================================================

$("confirmDelete")
    ?.addEventListener(
        "click",
        async () => {

            if (
                !currentDeleteId ||
                !currentUser
            ) {

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
                        currentDeleteId
                    )
                );


                hide(
                    "deleteModal"
                );


                currentDeleteId =
                    null;


                await loadRecords();


                alert(
                    "Referral deleted successfully."
                );


            } catch (error) {

                alert(
                    firebaseErrorMessage(
                        error
                    )
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


// =====================================================
// CLOSE BUTTONS
// =====================================================

document
    .querySelectorAll(
        "[data-close]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const id =
                    button.dataset.close;


                hide(id);


                if (
                    id ===
                    "referralModal"
                ) {

                    editingReferralId =
                        null;

                }


                if (
                    id ===
                    "statusModal"
                ) {

                    currentReferralId =
                        null;

                }


                if (
                    id ===
                    "deleteModal"
                ) {

                    currentDeleteId =
                        null;

                }

            }
        );

    });


// =====================================================
// CLICK OUTSIDE MODAL
// =====================================================

document
    .querySelectorAll(
        ".modal"
    )
    .forEach(modal => {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    modal
                ) {

                    hide(
                        modal.id
                    );

                }

            }
        );

    });


// =====================================================
// ESC KEY
// =====================================================

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Escape"
        ) {

            return;

        }


        document
            .querySelectorAll(
                ".modal.show"
            )
            .forEach(
                modal => {

                    hide(
                        modal.id
                    );

                }
            );

    }
);


// =====================================================
// SEARCH
// =====================================================

$("search")
    ?.addEventListener(
        "input",
        render
    );


// =====================================================
// STATUS FILTER
// =====================================================

$("statusFilter")
    ?.addEventListener(
        "change",
        render
    );


// =====================================================
// INSTITUTE FILTER
// =====================================================

$("typeFilter")
    ?.addEventListener(
        "change",
        render
    );


// =====================================================
// LOGOUT
// =====================================================

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

                alert(
                    firebaseErrorMessage(
                        error
                    )
                );

            }

        }
    );


// =====================================================
// AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            location.href =
                "index.html";

            return;

        }


        currentUser =
            user;


        if ($("userMobile")) {

            $("userMobile").textContent =
                user.email ||
                "Signed in";

        }


        await loadRecords();

    }
);


// =====================================================
// INITIAL UI
// =====================================================

updateOtherDefectVisibility();

toggleTreatment();
