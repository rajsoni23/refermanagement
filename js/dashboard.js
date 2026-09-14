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
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    firebaseConfig
} from "./firebase-config.js";


/* =========================================================
   FIREBASE
========================================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let currentReferralId = null;
let currentDeleteId = null;
let editingReferralId = null;
let records = [];


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[char])
    );
}

function value(id) {
    return String($(id)?.value || "").trim();
}

function cleanMobile(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 10);
}

function cleanAadhaar(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 12);
}

function show(id) {
    const element = $(id);
    if (!element) return;

    element.classList.add("show");
    element.setAttribute("aria-hidden", "false");
}

function hide(id) {
    const element = $(id);
    if (!element) return;

    element.classList.remove("show");
    element.setAttribute("aria-hidden", "true");
}


/* =========================================================
   INDIA DATE
========================================================= */

function today() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function formatDate(value) {
    if (!value) return "-";

    const raw = String(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [year, month, day] = raw.split("-");

        return `${day} ${new Date(
            Number(year),
            Number(month) - 1,
            Number(day)
        ).toLocaleString("en-IN", {
            month: "short"
        })} ${year}`;
    }

    try {
        if (value?.toDate) {
            return value.toDate().toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            );
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return raw;
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
        return raw;
    }
}


/* =========================================================
   FIREBASE ERROR
========================================================= */

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

        case "not-found":
            return "This referral record no longer exists.";

        default:
            return error?.message ||
                "Something went wrong. Please try again.";
    }
}


/* =========================================================
   FIRESTORE
========================================================= */

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


/* =========================================================
   DEFECT / HEALTH CONDITION
========================================================= */

function selectedDefects() {

    const selected = [
        ...document.querySelectorAll(
            "#defectList input[type='checkbox']:checked"
        )
    ].map(input => input.value);

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


function setSelectedDefects(defects) {

    document.querySelectorAll(
        "#defectList input[type='checkbox']"
    ).forEach(input => {
        input.checked = false;
    });

    if ($("otherDefectCheckbox")) {
        $("otherDefectCheckbox").checked = false;
    }

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
                "#defectList input[type='checkbox']"
            )
        ].find(
            input =>
                input.value === text
        );

        if (checkbox) {
            checkbox.checked = true;
        }
    });

    updateOtherDefectVisibility();
}


function updateOtherDefectVisibility() {

    const enabled =
        $("otherDefectCheckbox")?.checked;

    $("otherDefectBox")
        ?.classList.toggle(
            "hidden",
            !enabled
        );

    if (
        !enabled &&
        $("otherDefect")
    ) {
        $("otherDefect").value = "";
    }
}


/* =========================================================
   STATUS DATE FIELD
========================================================= */

function ensureStatusDateField() {

    const form =
        $("statusForm");

    if (!form) return null;

    let input =
        $("statusDate");

    if (input) {

        input.value =
            today();

        input.required =
            true;

        return input;
    }

    const wrapper =
        document.createElement("label");

    wrapper.id =
        "statusDateWrap";

    wrapper.innerHTML = `
        <span>Status Date</span>

        <input
            type="date"
            id="statusDate"
            name="statusDate"
            required
        >
    `;

    const statusControl =
        $("newStatus");

    const statusLabel =
        statusControl?.closest("label");

    if (
        statusLabel &&
        statusLabel.parentNode
    ) {

        statusLabel.parentNode.insertBefore(
            wrapper,
            statusLabel.nextSibling
        );

    } else {

        form.insertBefore(
            wrapper,
            form.firstChild
        );
    }

    input =
        $("statusDate");

    if (input) {

        input.value =
            today();

        input.required =
            true;
    }

    return input;
}


/* =========================================================
   STATUS HISTORY
========================================================= */

function makeStatusLog(
    status,
    date
) {

    return {
        status,
        date: date || today()
    };
}


function buildStatusHistory(record) {

    if (
        Array.isArray(
            record?.statusHistory
        ) &&
        record.statusHistory.length
    ) {

        return record.statusHistory
            .map(item => ({
                status: String(
                    item?.status || ""
                ),
                date: String(
                    item?.date || ""
                )
            }))
            .filter(
                item => item.status
            );
    }


    const history = [];


    if (
        record?.registeredDate ||
        record?.referralDate ||
        record?.createdAt
    ) {

        history.push(
            makeStatusLog(
                "Pending",
                record.registeredDate ||
                record.referralDate ||
                today()
            )
        );
    }


    if (record?.referredDate) {

        history.push(
            makeStatusLog(
                "Referred",
                record.referredDate
            )
        );
    }


    if (
        record?.treatmentStartedDate
    ) {

        history.push(
            makeStatusLog(
                "Treatment Started",
                record.treatmentStartedDate
            )
        );
    }


    if (record?.completedDate) {

        history.push(
            makeStatusLog(
                "Completed",
                record.completedDate
            )
        );
    }


    if (!history.length) {

        history.push(
            makeStatusLog(
                record?.status ||
                "Pending",
                today()
            )
        );
    }


    return history;
}


function statusClass(status) {

    return String(
        status || ""
    )
        .toLowerCase()
        .replace(
            /\s+/g,
            "-"
        );
}


function statusIcon(status) {

    switch (status) {

        case "Pending":
            return "⏳";

        case "Referred":
            return "↗";

        case "Treatment Started":
            return "✚";

        case "Completed":
            return "✓";

        default:
            return "•";
    }
}


function appendStatusHistory(
    record,
    status,
    date
) {

    const history =
        buildStatusHistory(record);

    const last =
        history[
            history.length - 1
        ];


    if (
        last &&
        last.status === status
    ) {

        last.date =
            date;

        return history;
    }


    history.push(
        makeStatusLog(
            status,
            date
        )
    );

    return history;
}


/* =========================================================
   LOAD RECORDS
========================================================= */

async function loadRecords() {

    if (!currentUser) return;

    const recordsElement =
        $("records");

    if (recordsElement) {

        recordsElement.innerHTML =
            `<div class="empty">
                Loading referral records...
            </div>`;
    }

    try {

        const q =
            query(
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
            "Load referrals error:",
            error
        );

        records = [];

        if (recordsElement) {

            recordsElement.innerHTML =
                `<div class="empty">
                    ${esc(
                        firebaseErrorMessage(
                            error
                        )
                    )}
                </div>`;
        }
    }
}


/* =========================================================
   STATISTICS
========================================================= */

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
            counts[
                "Treatment Started"
            ];
    }

    if ($("completed")) {
        $("completed").textContent =
            counts.Completed;
    }
}


/* =========================================================
   RENDER
========================================================= */

function render() {

    const search =
        value("search")
            .toLowerCase();

    const statusFilter =
        $("statusFilter")?.value ||
        "";

    const typeFilter =
        $("typeFilter")?.value ||
        "";


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


            return (

                (
                    !search ||
                    searchable.includes(
                        search
                    )
                )

                &&

                (
                    !statusFilter ||
                    record.status ===
                    statusFilter
                )

                &&

                (
                    !typeFilter ||
                    (
                        record.instituteType ||
                        record.type ||
                        ""
                    ) === typeFilter
                )
            );
        });


    const container =
        $("records");

    if (!container) return;


    container.innerHTML =
        filtered.length
            ? filtered
                .map(renderRecord)
                .join("")
            : `
                <div class="empty">
                    No referral records found.
                </div>
              `;


    updateStats();
}


/* =========================================================
   RECORD CARD
========================================================= */

function renderRecord(record) {

    const status =
        record.status ||
        "Pending";

    const badgeClass =
        status ===
            "Treatment Started"
            ? "started"
            : statusClass(status);


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


    const history =
        buildStatusHistory(
            record
        );


    const latest =
        history[
            history.length - 1
        ];


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

                        •

                        Registered:

                        ${esc(
                            formatDate(
                                record.registeredDate ||
                                record.referralDate
                            )
                        )}

                    </div>

                </div>


                <span
                    class="badge ${esc(
                        badgeClass
                    )}"
                >
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
                        record.sex ||
                        "-"
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
                        record.weight ||
                        "-"
                    )}

                    kg /

                    ${esc(
                        record.height ||
                        "-"
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
                        record.hospitalName ||
                        "-"
                    )}

                </div>


                <div>

                    <strong>
                        LAST STATUS DATE
                    </strong>

                    ${esc(
                        formatDate(
                            latest?.date
                        )
                    )}

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


function findRecord(id) {

    return records.find(
        record =>
            record.id === id
    );
}


/* =========================================================
   RESET REFERRAL FORM
========================================================= */

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
            .classList.add(
                "hidden"
            );
    }


    if ($("className")) {
        $("className").value =
            "";
    }


    if ($("awcWorkerNumber")) {
        $("awcWorkerNumber").value =
            "";
    }


    if ($("mobile3Label")) {

        $("mobile3Label")
            .textContent =
            "Mobile 3";
    }


    editingReferralId =
        null;


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
}


/* =========================================================
   FILL EDIT FORM
========================================================= */

function fillReferralForm(record) {

    const fields = {

        childName:
            record.childName ||
            record.name ||
            "",

        sex:
            record.sex ||
            "",

        dob:
            record.dob ||
            "",

        birthCertificateNo:
            record.birthCertificateNo ||
            "",

        fatherName:
            record.fatherName ||
            "",

        fatherAadhaar:
            record.fatherAadhaar ||
            "",

        motherName:
            record.motherName ||
            "",

        motherAadhaar:
            record.motherAadhaar ||
            "",

        villageName:
            record.villageName ||
            "",

        weight:
            record.weight ||
            "",

        height:
            record.height ||
            "",

        instituteName:
            record.instituteName ||
            "",

        className:
            record.className ||
            "",

        awcWorkerNumber:
            record.awcWorkerNumber ||
            "",

        mobile1:
            record.mobile1 ||
            "",

        mobile2:
            record.mobile2 ||
            "",

        mobile3:
            record.mobile3 ||
            ""
    };


    Object.entries(
        fields
    ).forEach(
        ([id, fieldValue]) => {

            if ($(id)) {

                $(id).value =
                    fieldValue;
            }
        }
    );


    setSelectedDefects(

        record.defects?.length
            ? record.defects
            : record.defect
                ? [record.defect]
                : []
    );


    const type =
        record.instituteType ||
        record.type ||
        "";


    if ($("instituteType")) {

        $("instituteType")
            .value =
            type;
    }


    updateInstituteFields(
        type
    );
}


/* =========================================================
   INSTITUTE TYPE
========================================================= */

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

        $("mobile3Label")
            .textContent =
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

        $("className").value =
            "";
    }


    if (
        type !== "AWC" &&
        $("awcWorkerNumber")
    ) {

        $("awcWorkerNumber").value =
            "";
    }
}


/* =========================================================
   NEW REFERRAL
========================================================= */

$("newReferral")?.addEventListener(
    "click",
    () => {

        resetReferralForm();

        show(
            "referralModal"
        );
    }
);


/* =========================================================
   EDIT REFERRAL
========================================================= */

window.editReferral =
    function(id) {

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


        hide(
            "detailsModal"
        );

        show(
            "referralModal"
        );
    };


/* =========================================================
   SAVE REFERRAL
========================================================= */

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


        const instituteType =
            value(
                "instituteType"
            );


        const childName =
            value(
                "childName"
            );


        const instituteName =
            value(
                "instituteName"
            );


        const defects =
            selectedDefects();


        if (!childName) {

            alert(
                "Please enter child name."
            );

            $("childName")?.focus();

            return;
        }


        if (!$("sex")?.value) {

            alert(
                "Please select sex."
            );

            $("sex")?.focus();

            return;
        }


        if (!$("dob")?.value) {

            alert(
                "Please select date of birth."
            );

            $("dob")?.focus();

            return;
        }


        if (!defects.length) {

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

            $("instituteName")?.focus();

            return;
        }


        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Saving...";
        }


        const referralData = {

            childName,

            sex:
                $("sex").value,

            dob:
                $("dob").value,

            birthCertificateNo:
                value(
                    "birthCertificateNo"
                ),

            fatherName:
                value(
                    "fatherName"
                ),

            fatherAadhaar:
                cleanAadhaar(
                    $("fatherAadhaar")
                        ?.value
                ),

            motherName:
                value(
                    "motherName"
                ),

            motherAadhaar:
                cleanAadhaar(
                    $("motherAadhaar")
                        ?.value
                ),

            villageName:
                value(
                    "villageName"
                ),

            weight:
                value(
                    "weight"
                ),

            height:
                value(
                    "height"
                ),

            defects,

            defect:
                defects.join(
                    ", "
                ),

            instituteType,

            instituteName,

            className:
                instituteType ===
                "School"
                    ? value(
                        "className"
                    )
                    : "",

            awcWorkerNumber:
                instituteType ===
                "AWC"
                    ? value(
                        "awcWorkerNumber"
                    )
                    : "",

            mobile1:
                cleanMobile(
                    $("mobile1")
                        ?.value
                ),

            mobile2:
                cleanMobile(
                    $("mobile2")
                        ?.value
                ),

            mobile3:
                cleanMobile(
                    $("mobile3")
                        ?.value
                ),

            updatedAt:
                serverTimestamp()
        };


        try {

            /* =================================================
               EDIT EXISTING
            ================================================= */

            if (
                editingReferralId
            ) {

                await updateDoc(

                    referralDocument(
                        editingReferralId
                    ),

                    referralData
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


            }

            /* =================================================
               CREATE NEW
            ================================================= */

            else {

                const registrationDate =
                    today();


                await addDoc(

                    referralsCollection(),

                    {

                        ...referralData,


                        status:
                            "Pending",


                        registeredDate:
                            registrationDate,


                        referralDate:
                            registrationDate,


                        referredDate:
                            "",


                        treatmentStartedDate:
                            "",


                        completedDate:
                            "",


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


                        /*
                         * Permanent status history
                         */
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


/* =========================================================
   STATUS MODAL
========================================================= */

window.openStatus =
    function(id) {

        const record =
            findRecord(id);

        if (!record) return;


        currentReferralId =
            record.id;


        if ($("newStatus")) {

            $("newStatus").value =
                record.status ||
                "Pending";
        }


        if ($("referType")) {

            $("referType").value =
                record.referType ||
                "";
        }


        if ($("privateHospital")) {

            $("privateHospital")
                .value =
                record.privateHospital ||
                "";
        }


        if ($("otherHospitalName")) {

            $("otherHospitalName")
                .value =
                record.otherHospitalName ||
                "";
        }


        if ($("hospitalName")) {

            $("hospitalName")
                .value =
                record.hospitalName ||
                "";
        }


        if ($("estimatedExpenditure")) {

            $("estimatedExpenditure")
                .value =
                record.estimatedTreatmentExpenditure ??
                record.estimatedExpenditure ??
                "";
        }


        /*
         * Status date automatically gets
         * today's date.
         */
        ensureStatusDateField();


        toggleTreatment();

        updateReferralTypeUI();


        show(
            "statusModal"
        );
    };


/* =========================================================
   REFERRAL TYPE UI
========================================================= */

function updateReferralTypeUI() {

    const referType =
        $("referType")?.value ||
        "";


    const privateSelected =
        referType ===
        "Private Hospital";


    if ($("privateHospitalWrap")) {

        $("privateHospitalWrap")
            .hidden =
            !privateSelected;
    }


    if ($("otherHospitalWrap")) {

        $("otherHospitalWrap")
            .hidden =
            !privateSelected ||
            $("privateHospital")
                ?.value !==
                "Other";
    }
}


/* =========================================================
   TREATMENT UI
========================================================= */

function toggleTreatment() {

    const status =
        $("newStatus")?.value ||
        "";


    const needsReferralDetails =
        [
            "Referred",
            "Treatment Started"
        ].includes(status);


    if ($("referTypeWrap")) {

        $("referTypeWrap").hidden =
            !needsReferralDetails;
    }


    if ($("treatmentFields")) {

        $("treatmentFields").hidden =
            !needsReferralDetails;
    }


    if ($("hospitalName")) {

        $("hospitalName").required =
            needsReferralDetails;
    }


    if ($("estimatedExpenditure")) {

        $("estimatedExpenditure")
            .required =
            needsReferralDetails;
    }


    updateReferralTypeUI();
}


/* =========================================================
   UPDATE STATUS
========================================================= */

$("statusForm")?.addEventListener(
    "submit",
    async event => {

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


        const record =
            findRecord(
                currentReferralId
            );


        if (!record) {

            alert(
                "Referral record not found."
            );

            return;
        }


        ensureStatusDateField();


        const status =
            $("newStatus")?.value ||
            "Pending";


        const statusDate =
            value(
                "statusDate"
            ) ||
            today();


        const referType =
            value(
                "referType"
            );


        const privateHospital =
            value(
                "privateHospital"
            );


        const otherHospitalName =
            value(
                "otherHospitalName"
            );


        const hospitalName =
            value(
                "hospitalName"
            );


        const expenditure =
            value(
                "estimatedExpenditure"
            );


        const needsReferralDetails =
            [
                "Referred",
                "Treatment Started"
            ].includes(status);


        /* =================================================
           VALIDATION
        ================================================= */

        if (!statusDate) {

            alert(
                "Please select status date."
            );

            $("statusDate")?.focus();

            return;
        }


        if (
            needsReferralDetails &&
            !referType
        ) {

            alert(
                "Please select Refer Type."
            );

            $("referType")?.focus();

            return;
        }


        if (
            needsReferralDetails &&
            referType ===
                "Private Hospital" &&
            !privateHospital
        ) {

            alert(
                "Please select private hospital."
            );

            $("privateHospital")?.focus();

            return;
        }


        if (
            needsReferralDetails &&
            referType ===
                "Private Hospital" &&
            privateHospital ===
                "Other" &&
            !otherHospitalName
        ) {

            alert(
                "Please enter hospital name."
            );

            $("otherHospitalName")
                ?.focus();

            return;
        }


        if (
            needsReferralDetails &&
            !hospitalName
        ) {

            alert(
                "Please enter hospital name."
            );

            $("hospitalName")?.focus();

            return;
        }


        if (
            needsReferralDetails &&
            !expenditure
        ) {

            alert(
                "Please enter estimated treatment expenditure."
            );

            $("estimatedExpenditure")
                ?.focus();

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

            /*
             * Add the new status to permanent
             * status history.
             */
            const statusHistory =
                appendStatusHistory(
                    record,
                    status,
                    statusDate
                );


            const updateData = {

                status,

                statusDate,

                statusHistory,

                updatedAt:
                    serverTimestamp()
            };


            /* =================================================
               STATUS-SPECIFIC DATES
            ================================================= */

            if (
                status ===
                "Pending"
            ) {

                updateData.registeredDate =
                    statusDate;

                updateData.referralDate =
                    statusDate;
            }


            if (
                status ===
                "Referred"
            ) {

                updateData.referredDate =
                    statusDate;
            }


            if (
                status ===
                "Treatment Started"
            ) {

                updateData.treatmentStartedDate =
                    statusDate;
            }


            if (
                status ===
                "Completed"
            ) {

                updateData.completedDate =
                    statusDate;
            }


            /* =================================================
               REFERRAL DETAILS
            ================================================= */

            if (
                needsReferralDetails
            ) {

                updateData.referType =
                    referType;


                updateData.privateHospital =
                    referType ===
                    "Private Hospital"
                        ? privateHospital
                        : "";


                updateData.otherHospitalName =

                    (
                        referType ===
                            "Private Hospital" &&
                        privateHospital ===
                            "Other"
                    )

                        ? otherHospitalName
                        : "";


                updateData.hospitalName =
                    hospitalName;


                updateData.estimatedTreatmentExpenditure =
                    expenditure;
            }


            /*
             * Pending status does not need
             * referral selection.
             */
            if (
                status ===
                "Pending"
            ) {

                updateData.referType =
                    "";

                updateData.privateHospital =
                    "";

                updateData.otherHospitalName =
                    "";
            }


            await updateDoc(

                referralDocument(
                    currentReferralId
                ),

                updateData
            );


            hide(
                "statusModal"
            );


            currentReferralId =
                null;


            await loadRecords();


            alert(
                `${status} status saved successfully on ${formatDate(statusDate)}.`
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
                    "Update";
            }
        }
    }
);


/* =========================================================
   VIEW DETAILS
========================================================= */

window.viewDetails =
    function(id) {

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


        const defects =
            record.defects?.length
                ? record.defects.join(
                    ", "
                )
                : record.defect ||
                  "-";


        const history =
            buildStatusHistory(
                record
            );


        const timelineHtml =
            history.length

                ? history.map(
                    item => `

                    <div
                        class="status-timeline-item"
                    >

                        <div
                            class="status-timeline-icon ${esc(
                                statusClass(
                                    item.status
                                )
                            )}"
                        >
                            ${statusIcon(
                                item.status
                            )}
                        </div>


                        <div
                            class="status-timeline-line"
                        ></div>


                        <div
                            class="status-timeline-body"
                        >

                            <div
                                class="status-timeline-top"
                            >

                                <strong>
                                    ${esc(
                                        item.status
                                    )}
                                </strong>


                                <span>
                                    ${esc(
                                        formatDate(
                                            item.date
                                        )
                                    )}
                                </span>

                            </div>


                            <small>
                                Status updated on
                                ${esc(
                                    formatDate(
                                        item.date
                                    )
                                )}
                            </small>

                        </div>

                    </div>

                `
                ).join("")

                : `
                    <div class="muted">
                        No status history available.
                    </div>
                `;


        $("detailsSubtitle")
            .textContent =
            `${childName} • ${type}`;


        $("detailsContent")
            .innerHTML = `

            <!-- STATUS HISTORY -->

            <div
                class="details-section status-history-section"
            >

                <h4>
                    📋 Referral Status History
                </h4>


                <div
                    class="status-timeline"
                >

                    ${timelineHtml}

                </div>

            </div>


            <div class="details-grid">


                <!-- CHILD -->

                <div
                    class="details-section"
                >

                    <h4>
                        Child Information
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Child Name
                        </span>

                        <strong>
                            ${esc(
                                childName
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Sex
                        </span>

                        <strong>
                            ${esc(
                                record.sex ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Date of Birth
                        </span>

                        <strong>
                            ${esc(
                                formatDate(
                                    record.dob
                                )
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Birth Certificate
                        </span>

                        <strong>
                            ${esc(
                                record.birthCertificateNo ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Village
                        </span>

                        <strong>
                            ${esc(
                                record.villageName ||
                                "-"
                            )}
                        </strong>
                    </div>

                </div>


                <!-- PARENTS -->

                <div
                    class="details-section"
                >

                    <h4>
                        Parent Information
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Father Name
                        </span>

                        <strong>
                            ${esc(
                                record.fatherName ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Father Aadhaar
                        </span>

                        <strong>
                            ${esc(
                                record.fatherAadhaar ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Mother Name
                        </span>

                        <strong>
                            ${esc(
                                record.motherName ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Mother Aadhaar
                        </span>

                        <strong>
                            ${esc(
                                record.motherAadhaar ||
                                "-"
                            )}
                        </strong>
                    </div>

                </div>


                <!-- HEALTH -->

                <div
                    class="details-section"
                >

                    <h4>
                        Health Information
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Defect / Health Condition
                        </span>

                        <strong>
                            ${esc(
                                defects
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Weight
                        </span>

                        <strong>
                            ${esc(
                                record.weight ||
                                "-"
                            )}
                            kg
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Height
                        </span>

                        <strong>
                            ${esc(
                                record.height ||
                                "-"
                            )}
                            cm
                        </strong>
                    </div>

                </div>


                <!-- INSTITUTE -->

                <div
                    class="details-section"
                >

                    <h4>
                        Institute Information
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Institute Type
                        </span>

                        <strong>
                            ${esc(
                                type
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Institute Name
                        </span>

                        <strong>
                            ${esc(
                                record.instituteName ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Class
                        </span>

                        <strong>
                            ${esc(
                                record.className ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            AWC Worker Number
                        </span>

                        <strong>
                            ${esc(
                                record.awcWorkerNumber ||
                                "-"
                            )}
                        </strong>
                    </div>

                </div>


                <!-- CONTACT -->

                <div
                    class="details-section"
                >

                    <h4>
                        Contact Information
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Mobile 1
                        </span>

                        <strong>
                            ${esc(
                                record.mobile1 ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Mobile 2
                        </span>

                        <strong>
                            ${esc(
                                record.mobile2 ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Mobile 3
                        </span>

                        <strong>
                            ${esc(
                                record.mobile3 ||
                                "-"
                            )}
                        </strong>
                    </div>

                </div>


                <!-- REFERRAL / TREATMENT -->

                <div
                    class="details-section"
                >

                    <h4>
                        Referral / Treatment
                    </h4>


                    <div
                        class="details-row"
                    >
                        <span>
                            Current Status
                        </span>

                        <strong>
                            ${esc(
                                record.status ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Registered Date
                        </span>

                        <strong>
                            ${esc(
                                formatDate(
                                    record.registeredDate ||
                                    record.referralDate
                                )
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Referred Date
                        </span>

                        <strong>
                            ${esc(
                                formatDate(
                                    record.referredDate
                                )
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Treatment Started
                        </span>

                        <strong>
                            ${esc(
                                formatDate(
                                    record.treatmentStartedDate
                                )
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Completed Date
                        </span>

                        <strong>
                            ${esc(
                                formatDate(
                                    record.completedDate
                                )
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Refer Type
                        </span>

                        <strong>
                            ${esc(
                                record.referType ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Private Hospital
                        </span>

                        <strong>
                            ${esc(
                                record.privateHospital ===
                                    "Other"

                                    ? record.otherHospitalName ||
                                      "Other"

                                    : record.privateHospital ||
                                      "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Hospital Name
                        </span>

                        <strong>
                            ${esc(
                                record.hospitalName ||
                                "-"
                            )}
                        </strong>
                    </div>


                    <div
                        class="details-row"
                    >
                        <span>
                            Estimated Expenditure
                        </span>

                        <strong>
                            ${
                                expenditure
                                    ? "₹ " +
                                      esc(
                                          expenditure
                                      )
                                    : "-"
                            }
                        </strong>
                    </div>

                </div>

            </div>
        `;


        show(
            "detailsModal"
        );
    };


/* =========================================================
   EDIT FROM DETAILS
========================================================= */

$("detailsEdit")?.addEventListener(
    "click",
    () => {

        if (!currentReferralId) {
            return;
        }


        const id =
            currentReferralId;


        hide(
            "detailsModal"
        );


        window.editReferral(
            id
        );
    }
);


/* =========================================================
   DELETE
========================================================= */

window.openDelete =
    function(id) {

        const record =
            findRecord(id);

        if (!record) return;


        currentDeleteId =
            record.id;


        if ($("deleteChildName")) {

            $("deleteChildName")
                .textContent =
                record.childName ||
                record.name ||
                "this child";
        }


        show(
            "deleteModal"
        );
    };


$("confirmDelete")?.addEventListener(
    "click",
    async () => {

        if (!currentDeleteId) {
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


        const button =
            $("confirmDelete");


        if (button) {

            button.disabled =
                true;

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


/* =========================================================
   EVENTS
========================================================= */

$("instituteType")?.addEventListener(
    "change",
    event => {

        updateInstituteFields(
            event.target.value
        );
    }
);


$("otherDefectCheckbox")
    ?.addEventListener(
        "change",
        updateOtherDefectVisibility
    );


$("referType")?.addEventListener(
    "change",
    updateReferralTypeUI
);


$("privateHospital")
    ?.addEventListener(
        "change",
        updateReferralTypeUI
    );


$("newStatus")?.addEventListener(
    "change",
    () => {

        toggleTreatment();


        /*
         * Whenever a status is selected,
         * today's date is automatically
         * prefilled.
         */
        if ($("statusDate")) {

            $("statusDate").value =
                today();
        }
    }
);


/* =========================================================
   CLOSE MODALS
========================================================= */

document
    .querySelectorAll(
        "[data-close]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const modalId =
                    button.dataset.close;


                hide(
                    modalId
                );


                if (
                    modalId ===
                    "referralModal"
                ) {

                    editingReferralId =
                        null;
                }


                if (
                    modalId ===
                    "statusModal"
                ) {

                    currentReferralId =
                        null;
                }


                if (
                    modalId ===
                    "deleteModal"
                ) {

                    currentDeleteId =
                        null;
                }
            }
        );
    });


/* =========================================================
   OUTSIDE MODAL CLICK
========================================================= */

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


/* =========================================================
   ESC
========================================================= */

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
            .forEach(modal => {

                hide(
                    modal.id
                );
            });
    }
);


/* =========================================================
   SEARCH / FILTER
========================================================= */

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


/* =========================================================
   MOBILE INPUTS
========================================================= */

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


/* =========================================================
   AADHAAR INPUTS
========================================================= */

[
    "fatherAadhaar",
    "motherAadhaar"
].forEach(id => {

    $(id)?.addEventListener(
        "input",
        function () {

            this.value =
                cleanAadhaar(
                    this.value
                );
        }
    );
});


/* =========================================================
   LOGOUT
========================================================= */

$("logout")?.addEventListener(
    "click",
    async () => {

        try {

            await signOut(
                auth
            );

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


/* =========================================================
   AUTHENTICATION
========================================================= */

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


        const userMobile =
            $("userMobile");


        if (userMobile) {

            const identifier =
                user.email ||
                "";


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


        /*
         * Prepare today's date for
         * status form.
         */
        ensureStatusDateField();
    }
);
