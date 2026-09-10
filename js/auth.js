import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    firebaseConfig
} from "./firebase-config.js";


// =========================================================
// FIREBASE INITIALIZATION
// =========================================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// =========================================================
// MOBILE → INTERNAL AUTH IDENTIFIER
// =========================================================

function emailForMobile(mobile) {
    return `${mobile}@rbsk.local`;
}


// =========================================================
// COMMON HELPERS
// =========================================================

function cleanMobile(value) {
    return String(value || "").replace(/\D/g, "");
}


function getMessageElement() {
    return (
        document.getElementById("loginMessage") ||
        document.getElementById("msg")
    );
}


function showMessage(message, type = "error") {

    const element = getMessageElement();

    if (!element) {
        return;
    }

    element.textContent = message;

    element.style.color =
        type === "success"
            ? "#15803d"
            : "#b91c1c";
}


function setButtonLoading(button, loading, normalText) {

    if (!button) {
        return;
    }

    button.disabled = loading;

    button.textContent =
        loading
            ? "Please wait..."
            : normalText;
}


// =========================================================
// FIREBASE ERROR MESSAGE
// =========================================================

function firebaseErrorMessage(error) {

    const code = error?.code || "";

    switch (code) {

        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Invalid mobile number or password.";

        case "auth/invalid-email":
            return "Invalid mobile number.";

        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";

        case "auth/network-request-failed":
            return "Network error. Please check your internet connection.";

        case "auth/email-already-in-use":
            return "An account already exists with this mobile number.";

        case "auth/weak-password":
            return "Password must contain at least 6 characters.";

        case "auth/operation-not-allowed":
            return "This login method is not enabled in Firebase Authentication.";

        default:
            return error?.message || "Something went wrong. Please try again.";
    }
}


// =========================================================
// LOGIN
// =========================================================

const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const mobileInput = document.getElementById("mobile");
        const passwordInput = document.getElementById("password");
        const loginButton = document.getElementById("loginButton");

        const mobile = cleanMobile(mobileInput?.value);
        const password = passwordInput?.value || "";

        showMessage("");

        // Mobile validation
        if (mobile.length !== 10) {

            showMessage(
                "Please enter a valid 10 digit mobile number."
            );

            mobileInput?.focus();

            return;
        }


        // Password validation
        if (!password) {

            showMessage(
                "Please enter your password."
            );

            passwordInput?.focus();

            return;
        }


        setButtonLoading(
            loginButton,
            true,
            "Login"
        );

        showMessage(
            "Signing in...",
            "success"
        );


        try {

            await signInWithEmailAndPassword(
                auth,
                emailForMobile(mobile),
                password
            );


            showMessage(
                "Login successful. Opening dashboard...",
                "success"
            );


            window.location.href = "dashboard.html";

        } catch (error) {

            console.error(
                "RBSK Login Error:",
                error
            );

            showMessage(
                firebaseErrorMessage(error)
            );

            setButtonLoading(
                loginButton,
                false,
                "Login"
            );
        }

    });

}


// =========================================================
// SHOW / HIDE PASSWORD
// =========================================================

const togglePassword =
    document.getElementById("togglePassword");

if (togglePassword) {

    togglePassword.addEventListener(
        "click",
        function () {

            const passwordInput =
                document.getElementById("password");

            if (!passwordInput) {
                return;
            }


            if (passwordInput.type === "password") {

                passwordInput.type = "text";

                togglePassword.textContent =
                    "Hide";

                togglePassword.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            } else {

                passwordInput.type = "password";

                togglePassword.textContent =
                    "Show";

                togglePassword.setAttribute(
                    "aria-label",
                    "Show password"
                );

            }

        }
    );

}


// =========================================================
// PROTOTYPE DEMO LOGIN
// =========================================================

const demoLogin =
    document.getElementById("demoLogin");

if (demoLogin) {

    demoLogin.addEventListener(
        "click",
        function () {

            localStorage.setItem(
                "rbskDemo",
                "1"
            );

            window.location.href =
                "dashboard.html";

        }
    );

}


// =========================================================
// REGISTRATION
// =========================================================

const registerForm =
    document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const nameInput =
                document.getElementById("name");

            const mobileInput =
                document.getElementById("mobile");

            const passwordInput =
                document.getElementById("password");

            const confirmInput =
                document.getElementById("confirm");


            const name =
                String(nameInput?.value || "").trim();

            const mobile =
                cleanMobile(mobileInput?.value);

            const password =
                passwordInput?.value || "";

            const confirmPassword =
                confirmInput?.value || "";


            showMessage("");


            // Name
            if (!name) {

                showMessage(
                    "Please enter your name."
                );

                nameInput?.focus();

                return;
            }


            // Mobile
            if (mobile.length !== 10) {

                showMessage(
                    "Please enter a valid 10 digit mobile number."
                );

                mobileInput?.focus();

                return;
            }


            // Password
            if (password.length < 6) {

                showMessage(
                    "Password must contain at least 6 characters."
                );

                passwordInput?.focus();

                return;
            }


            // Confirm password
            if (password !== confirmPassword) {

                showMessage(
                    "Passwords do not match."
                );

                confirmInput?.focus();

                return;
            }


            const registerButton =
                registerForm.querySelector(
                    'button[type="submit"]'
                );


            setButtonLoading(
                registerButton,
                true,
                "Create Account"
            );


            showMessage(
                "Creating your account...",
                "success"
            );


            try {

                const credential =
                    await createUserWithEmailAndPassword(
                        auth,
                        emailForMobile(mobile),
                        password
                    );


                await updateProfile(
                    credential.user,
                    {
                        displayName: name
                    }
                );


                showMessage(
                    "Account created successfully. Opening dashboard...",
                    "success"
                );


                window.location.href =
                    "dashboard.html";


            } catch (error) {

                console.error(
                    "RBSK Registration Error:",
                    error
                );

                showMessage(
                    firebaseErrorMessage(error)
                );

                setButtonLoading(
                    registerButton,
                    false,
                    "Create Account"
                );
            }

        }
    );

}


// =========================================================
// MOBILE INPUT — ONLY DIGITS
// =========================================================

document
    .querySelectorAll(
        'input[type="tel"]'
    )
    .forEach(function (input) {

        input.addEventListener(
            "input",
            function () {

                this.value =
                    this.value
                        .replace(/\D/g, "")
                        .slice(0, 10);

            }
        );

    });
