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
// FIREBASE
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
// DOM HELPERS
// =====================================================

const $ = (id) => document.getElementById(id);

function value(id) {
    const el = $(id);
    return el ? el.value.trim() : "";
}

function setValue(id, val) {
    const el = $(id);
    if (el) {
        el.value = val ?? "";
    }
}

function checked(id) {
    const el = $(id);
    return el ? el.checked : false;
}


// =====================================================
// DEFECT OPTIONS
// =====================================================

const DEFECT_IDS = [
    "defect1",
    "defect2",
    "defect3",
    "defect4",
    "defect5",
    "defect6",
    "defect7",
    "defect8",
    "defect9",
    "defect47",
    "defect48",
    "defect50",
    "otherDefectCheckbox"
];


// =====================================================
// SELECTED DEFECTS
// =====================================================

function selectedDefects() {

    const defects = [];

    DEFECT_IDS.forEach(id => {

        const el = $(id);

        if (el && el.checked) {

            if (id === "otherDefectCheckbox") {

                const custom = value("otherDefect");

                if (custom) {
                    defects.push(
                        `Other Health Condition - ${custom}`
                    );
                } else {
                    defects.push("Other Health Condition");
                }

            } else {

                defects.push(el.value || el.dataset.value || "");

            }
        }
    });

    return defects.filter(Boolean);
}


// =====================================================
// SET DEFECTS
// =====================================================

function setSelectedDefects(defects = []) {

    DEFECT_IDS.forEach(id => {

        const el = $(id);

        if (el) {
            el.checked = false;
        }

    });

    setValue("otherDefect", "");

    if (!Array.isArray(defects)) {
        updateOtherDefectVisibility();
        return;
    }

    defects.forEach(defect => {

        const text = String(defect);

        let matched = false;

        DEFECT_IDS.forEach(id => {

            if (id === "otherDefectCheckbox") return;

            const el = $(id);

            if (!el) return;

            const candidate =
                el.value ||
                el.dataset.value ||
                "";

            if (candidate === text) {

                el.checked = true;
                matched = true;
            }
        });

        if (!matched && text.startsWith("Other Health Condition")) {

            const other = $("otherDefectCheckbox");

            if (other) {
                other.checked = true;
            }

            const prefix = "Other Health Condition - ";

            if (text.startsWith(prefix)) {

                setValue(
                    "otherDefect",
                    text.substring(prefix.length)
                );

            }

        }

    });

    updateOtherDefectVisibility();
}


// =====================================================
// OTHER DEFECT VISIBILITY
// =====================================================

function updateOtherDefectVisibility() {

    const checkbox = $("otherDefectCheckbox");
    const box = $("otherDefectBox");

    if (!box) return;

    if (checkbox && checkbox.checked) {

        box.style.display = "block";

    } else {

        box.style.display = "none";
        setValue("otherDefect", "");

    }
}


// =====================================================
// INSTITUTE TYPE
// =====================================================

function updateInstituteFields() {

    const instituteType = value("instituteType");

    const classGroup = $("classGroup");
    const awcMobileGroup = $("awcMobileGroup");

    if (classGroup) {

        classGroup.style.display =
            instituteType === "School"
                ? "block"
                : "none";
    }

    if (awcMobileGroup) {

        awcMobileGroup.style.display =
            instituteType === "AWC"
                ? "block"
                : "none";
    }

    const mobile3Label = $("mobile3Label");

    if (mobile3Label) {

        if (instituteType === "School") {

            mobile3Label.textContent =
                "School Principal Mobile Number";

        } else if (instituteType === "AWC") {

            mobile3Label.textContent =
                "AWC Worker Mobile Number";

        } else {

            mobile3Label.textContent =
                "Mobile 3";
        }
    }
}


// =====================================================
// STATUS HELPERS
// =====================================================

function updateStatusFields() {

    const status = value("referralStatus");

    const treatmentSection = $("treatmentSection");

    if (!treatmentSection) return;

    if (
        status === "Referred" ||
        status === "Treatment Started" ||
        status === "Completed"
    ) {

        treatmentSection.style.display = "block";

    } else {

        treatmentSection.style.display = "none";
    }

    toggleTreatment();
}


// =====================================================
// TREATMENT / REFERRAL FIELDS
// =====================================================

function toggleTreatment() {

    const status = value("statusModalStatus");

    const treatmentFields =
        $("treatmentFields");

    if (!treatmentFields) return;

    if (
        status === "Referred" ||
        status === "Treatment Started" ||
        status === "Completed"
    ) {

        treatmentFields.style.display = "block";

    } else {

        treatmentFields.style.display = "none";
    }

    const referType =
        value("statusModalReferType");

    const privateHospital =
        $("privateHospitalGroup");

    const otherHospital =
        $("otherHospitalGroup");

    if (privateHospital) {

        privateHospital.style.display =
            referType === "Private Hospital"
                ? "block"
                : "none";
    }

    if (otherHospital) {

        otherHospital.style.display =
            (
                referType === "Private Hospital" &&
                value("statusModalPrivateHospital") === "Other"
            )
                ? "block"
                : "none";
    }
}


// =====================================================
// MODAL HELPERS
// =====================================================

function openModal(id) {

    const modal = $(id);

    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(id) {

    const modal = $(id);

    if (modal) {
        modal.classList.remove("active");
    }
}


// =====================================================
// RESET FORM
// =====================================================

function resetReferralForm() {

    const form = $("referralForm");

    if (form) {
        form.reset();
    }

    editingReferralId = null;

    setSelectedDefects([]);

    updateInstituteFields();

    updateOtherDefectVisibility();

    const title = $("referralModalTitle");

    if (title) {
        title.textContent = "New Referral";
    }

    const submitBtn =
        $("referralSubmitBtn");

    if (submitBtn) {
        submitBtn.textContent =
            "Save Referral";
    }
}


// =====================================================
// OPEN NEW REFERRAL
// =====================================================

window.openNewReferral = function () {

    resetReferralForm();

    openModal("referralModal");
};


// =====================================================
// CLOSE REFERRAL MODAL
// =====================================================

window.closeReferralModal = function () {

    closeModal("referralModal");

};


// =====================================================
// SAVE REFERRAL
// =====================================================

window.saveReferral = async function (event) {

    if (event) {
        event.preventDefault();
    }

    if (!currentUser) {

        alert("Please login first.");
        return;
    }

    const childName =
        value("childName");

    if (!childName) {

        alert("Please enter Child Name.");
        return;
    }

    const defects =
        selectedDefects();

    const instituteType =
        value("instituteType");

    const data = {

        childName,

        sex:
            value("sex"),

        dob:
            value("dob"),

        birthCertificateNumber:
            value("birthCertificateNumber"),

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

        defects,

        instituteType,

        instituteName:
            value("instituteName"),

        className:
            value("className"),

        awcWorkerNumber:
            value("awcWorkerNumber"),

        mobile1:
            value("mobile1"),

        mobile2:
            value("mobile2"),

        mobile3:
            value("mobile3"),

        status:
            value("referralStatus") || "Pending",

        referType:
            value("referType"),

        privateHospital:
            value("privateHospital"),

        otherHospitalName:
            value("otherHospitalName"),

        estimatedTreatmentExpenditure:
            value("estimatedTreatmentExpenditure"),

        updatedAt:
            serverTimestamp()
    };


    try {

        const submitBtn =
            $("referralSubmitBtn");

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent =
                editingReferralId
                    ? "Updating..."
                    : "Saving...";
        }


        if (editingReferralId) {

            const referralRef = doc(
                db,
                "users",
                currentUser.uid,
                "referrals",
                editingReferralId
            );

            await updateDoc(
                referralRef,
                data
            );

            alert("Referral updated successfully.");

        } else {

            data.createdAt =
                serverTimestamp();

            data.createdBy =
                currentUser.uid;

            await addDoc(
                collection(
                    db,
                    "users",
                    currentUser.uid,
                    "referrals"
                ),
                data
            );

            alert("Referral saved successfully.");
        }


        closeModal("referralModal");

        resetReferralForm();

        await loadReferrals();


    } catch (error) {

        console.error(
            "Save referral error:",
            error
        );

        alert(
            "Unable to save referral:\n" +
            error.message
        );

    } finally {

        const submitBtn =
            $("referralSubmitBtn");

        if (submitBtn) {

            submitBtn.disabled = false;

            submitBtn.textContent =
                editingReferralId
                    ? "Update Referral"
                    : "Save Referral";
        }
    }
};


// =====================================================
// FILL EDIT FORM
// =====================================================

function fillReferralForm(record) {

    setValue(
        "childName",
        record.childName
    );

    setValue(
        "sex",
        record.sex
    );

    setValue(
        "dob",
        record.dob
    );

    setValue(
        "birthCertificateNumber",
        record.birthCertificateNumber
    );

    setValue(
        "fatherName",
        record.fatherName
    );

    setValue(
        "fatherAadhaar",
        record.fatherAadhaar
    );

    setValue(
        "motherName",
        record.motherName
    );

    setValue(
        "motherAadhaar",
        record.motherAadhaar
    );

    setValue(
        "villageName",
        record.villageName
    );

    setValue(
        "weight",
        record.weight
    );

    setValue(
        "height",
        record.height
    );


    // Defects
    setSelectedDefects(
        record.defects || []
    );


    // Institute
    setValue(
        "instituteType",
        record.instituteType
    );

    setValue(
        "instituteName",
        record.instituteName
    );

    setValue(
        "className",
        record.className
    );

    setValue(
        "awcWorkerNumber",
        record.awcWorkerNumber
    );


    // Mobiles
    setValue(
        "mobile1",
        record.mobile1
    );

    setValue(
        "mobile2",
        record.mobile2
    );

    setValue(
        "mobile3",
        record.mobile3
    );


    // Status
    setValue(
        "referralStatus",
        record.status || "Pending"
    );

    setValue(
        "referType",
        record.referType
    );

    setValue(
        "privateHospital",
        record.privateHospital
    );

    setValue(
        "otherHospitalName",
        record.otherHospitalName
    );

    setValue(
        "estimatedTreatmentExpenditure",
        record.estimatedTreatmentExpenditure
    );


    updateInstituteFields();

    updateStatusFields();


    const title =
        $("referralModalTitle");

    if (title) {
        title.textContent =
            "Edit Referral";
    }

    const submitBtn =
        $("referralSubmitBtn");

    if (submitBtn) {

        submitBtn.textContent =
            "Update Referral";
    }
}


// =====================================================
// EDIT REFERRAL
// =====================================================

window.editReferral = function (id) {

    const record =
        records.find(
            item => item.id === id
        );

    if (!record) {

        alert("Referral not found.");
        return;
    }

    editingReferralId = id;

    fillReferralForm(record);

    openModal("referralModal");
};


// =====================================================
// LOAD REFERRALS
// =====================================================

async function loadReferrals() {

    if (!currentUser) return;

    try {

        const referralsRef =
            collection(
                db,
                "users",
                currentUser.uid,
                "referrals"
            );

        const q = query(
            referralsRef,
            orderBy(
                "createdAt",
                "desc"
            )
        );

        const snapshot =
            await getDocs(q);

        records = [];

        snapshot.forEach(
            snapshotDoc => {

                records.push({
                    id: snapshotDoc.id,
                    ...snapshotDoc.data()
                });

            }
        );


        renderReferrals();

        updateStats();

    } catch (error) {

        console.error(
            "Load referrals error:",
            error
        );

        // Fallback without orderBy
        try {

            const referralsRef =
                collection(
                    db,
                    "users",
                    currentUser.uid,
                    "referrals"
                );

            const snapshot =
                await getDocs(
                    referralsRef
                );

            records = [];

            snapshot.forEach(
                snapshotDoc => {

                    records.push({
                        id: snapshotDoc.id,
                        ...snapshotDoc.data()
                    });

                }
            );

            records.sort(
                (a, b) => {

                    const aTime =
                        a.createdAt?.seconds || 0;

                    const bTime =
                        b.createdAt?.seconds || 0;

                    return bTime - aTime;
                }
            );

            renderReferrals();

            updateStats();

        } catch (fallbackError) {

            console.error(
                fallbackError
            );

            alert(
                "Unable to load referrals:\n" +
                fallbackError.message
            );
        }
    }
}


// =====================================================
// STATUS BADGE
// =====================================================

function statusBadge(status) {

    const safe =
        status || "Pending";

    const className =
        safe
            .toLowerCase()
            .replace(/\s+/g, "-");

    return `
        <span class="status-badge ${className}">
            ${escapeHtml(safe)}
        </span>
    `;
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =====================================================
// FILTER / SEARCH
// =====================================================

function getFilteredRecords() {

    const search =
        (
            value("searchInput") ||
            value("search") ||
            ""
        ).toLowerCase();

    const status =
        value("statusFilter");

    const instituteType =
        value("instituteFilter");

    return records.filter(
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
                record.birthCertificateNumber
            ]
                .join(" ")
                .toLowerCase();

            const searchMatch =
                !search ||
                searchable.includes(search);

            const statusMatch =
                !status ||
                status === "All" ||
                record.status === status;

            const instituteMatch =
                !instituteType ||
                instituteType === "All" ||
                record.instituteType === instituteType;

            return (
                searchMatch &&
                statusMatch &&
                instituteMatch
            );
        }
    );
}


// =====================================================
// RENDER REFERRALS
// =====================================================

function renderReferrals() {

    const list =
        getFilteredRecords();

    const container =
        $("referralList") ||
        $("referralsList") ||
        $("referralTableBody");

    if (!container) return;


    if (!list.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>No Referrals Found</h3>
                <p>Create a new referral to get started.</p>
            </div>
        `;

        return;
    }


    // If table body
    if (
        container.tagName === "TBODY"
    ) {

        container.innerHTML =
            list.map(record => `

                <tr>

                    <td>
                        ${escapeHtml(
                            record.childName
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            record.sex || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            record.villageName || "-"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            record.instituteName || "-"
                        )}
                    </td>

                    <td>
                        ${statusBadge(
                            record.status
                        )}
                    </td>

                    <td>
                        <button
                            type="button"
                            onclick="viewReferral('${record.id}')"
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
                            Status
                        </button>

                        <button
                            type="button"
                            onclick="confirmDelete('${record.id}')"
                        >
                            Delete
                        </button>
                    </td>

                </tr>

            `).join("");

        return;
    }


    // Card layout
    container.innerHTML =
        list.map(record => `

            <div class="referral-card">

                <div class="referral-card-header">

                    <div>

                        <h3>
                            ${escapeHtml(
                                record.childName ||
                                "Unnamed Child"
                            )}
                        </h3>

                        <small>
                            ${escapeHtml(
                                record.sex || ""
                            )}
                            ${record.dob
                                ? " • " +
                                  escapeHtml(record.dob)
                                : ""}
                        </small>

                    </div>

                    ${statusBadge(
                        record.status
                    )}

                </div>


                <div class="referral-card-body">

                    <div>
                        <strong>Village:</strong>
                        ${escapeHtml(
                            record.villageName || "-"
                        )}
                    </div>

                    <div>
                        <strong>Institute:</strong>
                        ${escapeHtml(
                            record.instituteName || "-"
                        )}
                    </div>

                    <div>
                        <strong>Condition:</strong>
                        ${escapeHtml(
                            (record.defects || []).join(", ") || "-"
                        )}
                    </div>

                </div>


                <div class="referral-card-actions">

                    <button
                        type="button"
                        onclick="viewReferral('${record.id}')"
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
                        Status
                    </button>

                    <button
                        type="button"
                        onclick="confirmDelete('${record.id}')"
                    >
                        Delete
                    </button>

                </div>

            </div>

        `).join("");
}


// =====================================================
// SEARCH / FILTER EVENTS
// =====================================================

function applyFilters() {

    renderReferrals();
}


document.addEventListener(
    "input",
    event => {

        if (
            event.target.id === "searchInput" ||
            event.target.id === "search"
        ) {

            applyFilters();
        }
    }
);


document.addEventListener(
    "change",
    event => {

        if (
            event.target.id === "statusFilter" ||
            event.target.id === "instituteFilter"
        ) {

            applyFilters();
        }

        if (
            event.target.id === "instituteType"
        ) {

            updateInstituteFields();
        }

        if (
            event.target.id === "otherDefectCheckbox"
        ) {

            updateOtherDefectVisibility();
        }

        if (
            event.target.id === "referralStatus"
        ) {

            updateStatusFields();
        }
    }
);


// =====================================================
// STATS
// =====================================================

function updateStats() {

    const total =
        records.length;

    const pending =
        records.filter(
            r => (r.status || "Pending") === "Pending"
        ).length;

    const referred =
        records.filter(
            r => r.status === "Referred"
        ).length;

    const treatment =
        records.filter(
            r => r.status === "Treatment Started"
        ).length;

    const completed =
        records.filter(
            r => r.status === "Completed"
        ).length;


    setText(
        "totalCount",
        total
    );

    setText(
        "pendingCount",
        pending
    );

    setText(
        "referredCount",
        referred
    );

    setText(
        "treatmentCount",
        treatment
    );

    setText(
        "completedCount",
        completed
    );


    // Alternative IDs
    setText(
        "totalReferrals",
        total
    );

    setText(
        "pendingReferrals",
        pending
    );

    setText(
        "referredReferrals",
        referred
    );

    setText(
        "treatmentStarted",
        treatment
    );

    setText(
        "completedReferrals",
        completed
    );
}


function setText(id, text) {

    const el = $(id);

    if (el) {
        el.textContent = text;
    }
}


// =====================================================
// STATUS MODAL
// =====================================================

window.openStatus = function (id) {

    const record =
        records.find(
            item => item.id === id
        );

    if (!record) {

        alert("Referral not found.");
        return;
    }

    currentReferralId = id;


    setValue(
        "statusModalStatus",
        record.status || "Pending"
    );

    setValue(
        "statusModalReferType",
        record.referType || ""
    );

    setValue(
        "statusModalPrivateHospital",
        record.privateHospital || ""
    );

    setValue(
        "statusModalOtherHospital",
        record.otherHospitalName || ""
    );

    setValue(
        "statusModalOtherHospitalName",
        record.otherHospitalName || ""
    );

    setValue(
        "statusModalHospitalName",
        record.hospitalName || ""
    );

    setValue(
        "statusModalEstimatedTreatmentExpenditure",
        record.estimatedTreatmentExpenditure || ""
    );


    toggleTreatment();

    openModal("statusModal");
};


// =====================================================
// SAVE STATUS
// =====================================================

window.saveStatus = async function () {

    if (!currentUser || !currentReferralId) {
        return;
    }


    const status =
        value("statusModalStatus") ||
        "Pending";

    const referType =
        value("statusModalReferType");

    const privateHospital =
        value("statusModalPrivateHospital");

    const otherHospitalName =
        value("statusModalOtherHospitalName") ||
        value("statusModalOtherHospital");

    const hospitalName =
        value("statusModalHospitalName");

    const estimated =
        value(
            "statusModalEstimatedTreatmentExpenditure"
        );


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

            referType,

            privateHospital,

            otherHospitalName,

            hospitalName,

            estimatedTreatmentExpenditure:
                estimated,

            updatedAt:
                serverTimestamp()
        };


        if (status === "Referred") {

            updateData.referredAt =
                serverTimestamp();

        }

        if (status === "Treatment Started") {

            updateData.treatmentStartedAt =
                serverTimestamp();

        }

        if (status === "Completed") {

            updateData.completedAt =
                serverTimestamp();

        }


        await updateDoc(
            referralRef,
            updateData
        );


        closeModal("statusModal");

        await loadReferrals();

        alert(
            "Referral status updated successfully."
        );


    } catch (error) {

        console.error(
            "Status update error:",
            error
        );

        alert(
            "Unable to update status:\n" +
            error.message
        );
    }
};


// =====================================================
// CLOSE STATUS
// =====================================================

window.closeStatusModal = function () {

    closeModal("statusModal");

};


// =====================================================
// VIEW REFERRAL
// =====================================================

window.viewReferral = function (id) {

    const record =
        records.find(
            item => item.id === id
        );

    if (!record) {

        alert("Referral not found.");
        return;
    }

    const container =
        $("detailsContent") ||
        $("referralDetailsContent");

    if (!container) {

        console.log(
            "Referral details:",
            record
        );

        return;
    }


    const defects =
        Array.isArray(record.defects)
            ? record.defects
            : [];


    container.innerHTML = `

        <div class="details-section">

            <h3>Child Details</h3>

            <p>
                <strong>Name:</strong>
                ${escapeHtml(
                    record.childName || "-"
                )}
            </p>

            <p>
                <strong>Sex:</strong>
                ${escapeHtml(
                    record.sex || "-"
                )}
            </p>

            <p>
                <strong>DOB:</strong>
                ${escapeHtml(
                    record.dob || "-"
                )}
            </p>

            <p>
                <strong>Birth Certificate No:</strong>
                ${escapeHtml(
                    record.birthCertificateNumber || "-"
                )}
            </p>

            <p>
                <strong>Village:</strong>
                ${escapeHtml(
                    record.villageName || "-"
                )}
            </p>

            <p>
                <strong>Weight:</strong>
                ${escapeHtml(
                    record.weight || "-"
                )}
            </p>

            <p>
                <strong>Height:</strong>
                ${escapeHtml(
                    record.height || "-"
                )}
            </p>

        </div>


        <div class="details-section">

            <h3>Parent Details</h3>

            <p>
                <strong>Father Name:</strong>
                ${escapeHtml(
                    record.fatherName || "-"
                )}
            </p>

            <p>
                <strong>Father Aadhaar:</strong>
                ${escapeHtml(
                    record.fatherAadhaar || "-"
                )}
            </p>

            <p>
                <strong>Mother Name:</strong>
                ${escapeHtml(
                    record.motherName || "-"
                )}
            </p>

            <p>
                <strong>Mother Aadhaar:</strong>
                ${escapeHtml(
                    record.motherAadhaar || "-"
                )}
            </p>

        </div>


        <div class="details-section">

            <h3>Health Condition</h3>

            <p>
                ${defects.length
                    ? defects.map(
                        d =>
                            `<span class="condition-tag">
                                ${escapeHtml(d)}
                            </span>`
                      ).join(" ")
                    : "-"
                }
            </p>

        </div>


        <div class="details-section">

            <h3>Institute Details</h3>

            <p>
                <strong>Type:</strong>
                ${escapeHtml(
                    record.instituteType || "-"
                )}
            </p>

            <p>
                <strong>Institute:</strong>
                ${escapeHtml(
                    record.instituteName || "-"
                )}
            </p>

            <p>
                <strong>Class:</strong>
                ${escapeHtml(
                    record.className || "-"
                )}
            </p>

            <p>
                <strong>AWC Worker:</strong>
                ${escapeHtml(
                    record.awcWorkerNumber || "-"
                )}
            </p>

        </div>


        <div class="details-section">

            <h3>Contact Details</h3>

            <p>
                <strong>Mobile 1:</strong>
                ${escapeHtml(
                    record.mobile1 || "-"
                )}
            </p>

            <p>
                <strong>Mobile 2:</strong>
                ${escapeHtml(
                    record.mobile2 || "-"
                )}
            </p>

            <p>
                <strong>Mobile 3:</strong>
                ${escapeHtml(
                    record.mobile3 || "-"
                )}
            </p>

        </div>


        <div class="details-section">

            <h3>Referral / Treatment</h3>

            <p>
                <strong>Status:</strong>
                ${statusBadge(
                    record.status
                )}
            </p>

            <p>
                <strong>Refer Type:</strong>
                ${escapeHtml(
                    record.referType || "-"
                )}
            </p>

            <p>
                <strong>Private Hospital:</strong>
                ${escapeHtml(
                    record.privateHospital || "-"
                )}
            </p>

            <p>
                <strong>Other Hospital:</strong>
                ${escapeHtml(
                    record.otherHospitalName || "-"
                )}
            </p>

            <p>
                <strong>Hospital Name:</strong>
                ${escapeHtml(
                    record.hospitalName || "-"
                )}
            </p>

            <p>
                <strong>Estimated Treatment Expenditure:</strong>
                ${escapeHtml(
                    record.estimatedTreatmentExpenditure || "-"
                )}
            </p>

        </div>


        <div class="details-section">

            <h3>Documents</h3>

            <p>
                File upload is currently disabled.
            </p>

        </div>

    `;


    openModal("detailsModal");
};


// =====================================================
// CLOSE DETAILS
// =====================================================

window.closeDetailsModal = function () {

    closeModal("detailsModal");

};


// =====================================================
// DELETE CONFIRMATION
// =====================================================

window.confirmDelete = function (id) {

    const record =
        records.find(
            item => item.id === id
        );

    if (!record) return;

    currentDeleteId = id;

    const name =
        $("deleteChildName");

    if (name) {

        name.textContent =
            record.childName ||
            "this referral";
    }

    openModal("deleteModal");
};


// =====================================================
// DELETE REFERRAL
// =====================================================

window.deleteReferral = async function () {

    if (
        !currentUser ||
        !currentDeleteId
    ) {
        return;
    }


    try {

        const referralRef =
            doc(
                db,
                "users",
                currentUser.uid,
                "referrals",
                currentDeleteId
            );


        await deleteDoc(
            referralRef
        );


        closeModal("deleteModal");

        currentDeleteId = null;

        await loadReferrals();

        alert(
            "Referral deleted successfully."
        );


    } catch (error) {

        console.error(
            "Delete error:",
            error
        );

        alert(
            "Unable to delete referral:\n" +
            error.message
        );
    }
};


// =====================================================
// CLOSE DELETE
// =====================================================

window.closeDeleteModal = function () {

    closeModal("deleteModal");

    currentDeleteId = null;
};


// =====================================================
// LOGOUT
// =====================================================

window.logout = async function () {

    try {

        await signOut(auth);

        window.location.href =
            "index.html";

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

        alert(
            "Unable to logout:\n" +
            error.message
        );
    }
};


// =====================================================
// AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            currentUser = null;

            window.location.href =
                "index.html";

            return;
        }


        currentUser = user;


        const email =
            $("userEmail");

        if (email) {

            email.textContent =
                user.email || "";
        }


        await loadReferrals();

    }
);


// =====================================================
// INITIAL UI SETUP
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        updateInstituteFields();

        updateOtherDefectVisibility();

        updateStatusFields();


        // Close modal by clicking outside
        document.addEventListener(
            "click",
            event => {

                if (
                    event.target.classList &&
                    event.target.classList.contains("modal")
                ) {

                    event.target.classList.remove(
                        "active"
                    );
                }
            }
        );


        // Escape key closes active modal
        document.addEventListener(
            "keydown",
            event => {

                if (event.key !== "Escape") {
                    return;
                }

                document
                    .querySelectorAll(
                        ".modal.active"
                    )
                    .forEach(
                        modal => {
                            modal.classList.remove(
                                "active"
                            );
                        }
                    );
            }
        );

    }
);
