// ============================================================
// SHREE RBSK
// SECURE CLOUDINARY + FIREBASE AUTH WORKER
// ============================================================
//
// PURPOSE:
// 1. Verify Firebase ID token
// 2. Upload files securely to Cloudinary
// 3. Store assets as AUTHENTICATED
// 4. Never expose Cloudinary API Secret to browser
// 5. Generate signed delivery URLs
//
// REQUIRED WORKER SECRETS:
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//
// REQUIRED VARIABLES:
//   CLOUDINARY_CLOUD_NAME
//   FIREBASE_PROJECT_ID
//
// ============================================================


// ============================================================
// CONFIG
// ============================================================

const CLOUDINARY_CLOUD_NAME = "uwqzqwyv0";

const FIREBASE_PROJECT_ID = "rbskrefer";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
];


// ============================================================
// CORS
// ============================================================
//
// IMPORTANT:
// Add your real website domain here before production.
//
// During local development localhost is allowed.
// ============================================================

const ALLOWED_ORIGINS = [
    "https://refermanagement.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];


function getCorsOrigin(request) {

    const origin =
        request.headers.get("Origin") || "";

    if (ALLOWED_ORIGINS.includes(origin)) {
        return origin;
    }

    return "";
}


function corsHeaders(request) {

    const origin =
        getCorsOrigin(request);

    const headers = {
        "Access-Control-Allow-Methods":
            "POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization",

        "Access-Control-Max-Age":
            "86400",

        "Vary":
            "Origin"
    };

    if (origin) {
        headers["Access-Control-Allow-Origin"] =
            origin;
    }

    return headers;
}


// ============================================================
// JSON RESPONSE
// ============================================================

function jsonResponse(
    data,
    status,
    request
) {

    return new Response(
        JSON.stringify(data),
        {
            status,

            headers: {
                "Content-Type":
                    "application/json",

                ...corsHeaders(request)
            }
        }
    );
}


// ============================================================
// HASH HELPERS
// ============================================================

function arrayBufferToBase64Url(
    buffer
) {

    const bytes =
        new Uint8Array(buffer);

    let binary = "";

    const chunkSize = 0x8000;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                i + chunkSize
            )
        );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}


async function sha256(
    data
) {

    const encoder =
        new TextEncoder();

    return crypto.subtle.digest(
        "SHA-256",
        encoder.encode(data)
    );
}


async function sha1(
    data
) {

    const encoder =
        new TextEncoder();

    return crypto.subtle.digest(
        "SHA-1",
        encoder.encode(data)
    );
}


// ============================================================
// CLOUDINARY UPLOAD SIGNATURE
// ============================================================
//
// Cloudinary signed requests:
// sorted parameters + API secret
//
// We are using Basic Authentication for the server-side
// upload itself, so this helper is not required for upload.
// It is retained for signed delivery URL generation.
// ============================================================


// ============================================================
// SANITIZE
// ============================================================

function sanitizeFileName(
    name
) {

    return String(name || "file")
        .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        )
        .replace(
            /_+/g,
            "_"
        )
        .slice(
            0,
            120
        );
}


function sanitizePathPart(
    value
) {

    return String(value || "unknown")
        .replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
        )
        .replace(
            /_+/g,
            "_"
        )
        .slice(
            0,
            80
        );
}


// ============================================================
// FILE EXTENSION
// ============================================================

function getExtension(
    fileName,
    contentType
) {

    const original =
        String(fileName || "");

    const match =
        original.match(
            /\.([a-zA-Z0-9]+)$/
        );

    if (match) {

        return match[1]
            .toLowerCase();
    }

    const extensions = {

        "application/pdf":
            "pdf",

        "image/jpeg":
            "jpg",

        "image/jpg":
            "jpg",

        "image/png":
            "png",

        "image/webp":
            "webp"
    };

    return (
        extensions[contentType] ||
        "bin"
    );
}


// ============================================================
// RANDOM ID
// ============================================================

function randomId() {

    return crypto
        .randomUUID()
        .replace(/-/g, "");
}


// ============================================================
// CLOUDINARY DELIVERY SIGNATURE
// ============================================================
//
// For authenticated delivery:
// /s--SIGNATURE--/
//
// Signature is generated from the delivery path +
// API secret.
//
// Cloudinary recommends that API Secret never be exposed
// client-side.
// ============================================================

async function createDeliverySignature(
    path,
    apiSecret
) {

    const digest =
        await sha1(
            `${path}${apiSecret}`
        );

    const base64Url =
        arrayBufferToBase64Url(
            digest
        );

    return base64Url
        .slice(0, 8);
}


// ============================================================
// CREATE AUTHENTICATED DELIVERY URL
// ============================================================

async function createAuthenticatedUrl(
    uploadData,
    env
) {

    const resourceType =
        uploadData.resource_type ||
        "image";

    const publicId =
        uploadData.public_id;

    const version =
        uploadData.version;

    if (!publicId) {
        return "";
    }


    // --------------------------------------------------------
    // Cloudinary delivery path
    // --------------------------------------------------------

    let deliveryPath =
        `${resourceType}/authenticated/`;


    if (version) {

        deliveryPath +=
            `v${version}/`;
    }


    deliveryPath +=
        publicId;


    // --------------------------------------------------------
    // Raw assets such as PDF may contain extension.
    // Cloudinary response already tells us public_id.
    // --------------------------------------------------------

    const signature =
        await createDeliverySignature(
            deliveryPath,
            env.7PNse0VxICQn_seWHLG5mapbxCc
        );


    return (
        `https://res.cloudinary.com/` +
        `${CLOUDINARY_CLOUD_NAME}/` +
        `${resourceType}/authenticated/` +
        `s--${signature}--/` +
        (version
            ? `v${version}/`
            : "") +
        publicId
    );
}


// ============================================================
// FIREBASE JWT
// ============================================================

let firebaseCertCache = null;
let firebaseCertCacheExpires = 0;


// ============================================================
// FETCH FIREBASE PUBLIC CERTIFICATES
// ============================================================

async function getFirebaseCertificates() {

    const now =
        Date.now();

    if (
        firebaseCertCache &&
        now < firebaseCertCacheExpires
    ) {

        return firebaseCertCache;
    }


    const response =
        await fetch(
            "https://www.googleapis.com/" +
            "robot/v1/metadata/x509/" +
            "securetoken@system.gserviceaccount.com"
        );


    if (!response.ok) {

        throw new Error(
            "Unable to load Firebase certificates."
        );
    }


    const cacheControl =
        response.headers.get(
            "Cache-Control"
        ) || "";


    const maxAgeMatch =
        cacheControl.match(
            /max-age=(\d+)/
        );


    const maxAge =
        maxAgeMatch
            ? Number(maxAgeMatch[1]) * 1000
            : 3600000;


    firebaseCertCache =
        await response.json();


    firebaseCertCacheExpires =
        now + maxAge;


    return firebaseCertCache;
}


// ============================================================
// PEM → CRYPTO KEY
// ============================================================

function pemToArrayBuffer(
    pem
) {

    const base64 =
        pem
            .replace(
                /-----BEGIN CERTIFICATE-----/g,
                ""
            )
            .replace(
                /-----END CERTIFICATE-----/g,
                ""
            )
            .replace(
                /\s/g,
                ""
            );

    const binary =
        atob(base64);

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);
    }

    return bytes.buffer;
}


// ============================================================
// DER CERTIFICATE → PUBLIC KEY
// ============================================================

async function certificateToPublicKey(
    certificate
) {

    const certificateBuffer =
        pemToArrayBuffer(
            certificate
        );

    const certificate =
        new Uint8Array(
            certificateBuffer
        );


    // --------------------------------------------------------
    // Web Crypto does not directly import X.509 certificates.
    // We extract the SubjectPublicKeyInfo from the certificate.
    //
    // For Firebase secure token certificates, the SPKI is
    // located inside the certificate DER.
    // --------------------------------------------------------

    const spki =
        extractSpkiFromCertificate(
            certificate
        );


    return crypto.subtle.importKey(
        "spki",
        spki,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256"
        },
        false,
        ["verify"]
    );
}


// ============================================================
// DER HELPERS
// ============================================================

function readDerLength(
    bytes,
    offset
) {

    const first =
        bytes[offset];

    if (
        first < 0x80
    ) {

        return {
            length: first,
            offset: offset + 1
        };
    }


    const count =
        first & 0x7f;

    let length = 0;

    for (
        let i = 0;
        i < count;
        i++
    ) {

        length =
            (length << 8) |
            bytes[offset + 1 + i];
    }


    return {
        length,
        offset:
            offset + 1 + count
    };
}


function readDerElement(
    bytes,
    offset
) {

    const tag =
        bytes[offset];

    const lengthInfo =
        readDerLength(
            bytes,
            offset + 1
        );

    const start =
        lengthInfo.offset;

    const end =
        start + lengthInfo.length;

    return {
        tag,
        start,
        end,
        next: end
    };
}


// ============================================================
// EXTRACT SPKI
// ============================================================

function extractSpkiFromCertificate(
    bytes
) {

    // Certificate
    const cert =
        readDerElement(
            bytes,
            0
        );


    // Certificate SEQUENCE
    const certBody =
        bytes.subarray(
            cert.start,
            cert.end
        );


    // TBSCertificate
    const tbs =
        readDerElement(
            certBody,
            0
        );


    const tbsBytes =
        certBody.subarray(
            tbs.start,
            tbs.end
        );


    let offset = 0;


    // Version [0] EXPLICIT is optional.
    if (
        tbsBytes[offset] === 0xa0
    ) {

        const version =
            readDerElement(
                tbsBytes,
                offset
            );

        offset =
            version.next;
    }


    // Serial Number
    offset =
        readDerElement(
            tbsBytes,
            offset
        ).next;


    // Signature
    offset =
        readDerElement(
            tbsBytes,
            offset
        ).next;


    // Issuer
    offset =
        readDerElement(
            tbsBytes,
            offset
        ).next;


    // Validity
    offset =
        readDerElement(
            tbsBytes,
            offset
        ).next;


    // Subject
    offset =
        readDerElement(
            tbsBytes,
            offset
        ).next;


    // SubjectPublicKeyInfo
    const spki =
        readDerElement(
            tbsBytes,
            offset
        );


    return tbsBytes.slice(
        spki.start - 0,
        spki.end
    );
}


// ============================================================
// BASE64URL
// ============================================================

function base64UrlDecode(
    value
) {

    let str =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    while (
        str.length % 4
    ) {

        str += "=";
    }

    const binary =
        atob(str);

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);
    }

    return bytes;
}


// ============================================================
// FIREBASE TOKEN VERIFICATION
// ============================================================

async function verifyFirebaseToken(
    request,
    env
) {

    const authorization =
        request.headers.get(
            "Authorization"
        ) || "";


    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {

        throw new Error(
            "Authentication required."
        );
    }


    const token =
        authorization
            .slice(7)
            .trim();


    if (!token) {

        throw new Error(
            "Missing Firebase ID token."
        );
    }


    const parts =
        token.split(".");


    if (
        parts.length !== 3
    ) {

        throw new Error(
            "Invalid Firebase ID token."
        );
    }


    const header =
        JSON.parse(
            new TextDecoder()
                .decode(
                    base64UrlDecode(
                        parts[0]
                    )
                )
        );


    const payload =
        JSON.parse(
            new TextDecoder()
                .decode(
                    base64UrlDecode(
                        parts[1]
                    )
                )
        );


    // --------------------------------------------------------
    // Validate token claims
    // --------------------------------------------------------

    const now =
        Math.floor(
            Date.now() / 1000
        );


    if (
        header.alg !==
        "RS256"
    ) {

        throw new Error(
            "Invalid token algorithm."
        );
    }


    if (
        payload.aud !==
        FIREBASE_PROJECT_ID
    ) {

        throw new Error(
            "Invalid token audience."
        );
    }


    if (
        payload.iss !==
        `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    ) {

        throw new Error(
            "Invalid token issuer."
        );
    }


    if (
        !payload.sub ||
        typeof payload.sub !== "string"
    ) {

        throw new Error(
            "Invalid Firebase user."
        );
    }


    if (
        payload.exp <= now
    ) {

        throw new Error(
            "Firebase token has expired."
        );
    }


    if (
        payload.iat > now + 60
    ) {

        throw new Error(
            "Invalid token issue time."
        );
    }


    // --------------------------------------------------------
    // Verify RSA signature
    // --------------------------------------------------------

    const certificates =
        await getFirebaseCertificates();


    const certificate =
        certificates[
            header.kid
        ];


    if (!certificate) {

        throw new Error(
            "Firebase signing certificate not found."
        );
    }


    const publicKey =
        await certificateToPublicKey(
            certificate
        );


    const data =
        new TextEncoder().encode(
            `${parts[0]}.${parts[1]}`
        );


    const signature =
        base64UrlDecode(
            parts[2]
        );


    const valid =
        await crypto.subtle.verify(
            {
                name:
                    "RSASSA-PKCS1-v1_5"
            },
            publicKey,
            signature,
            data
        );


    if (!valid) {

        throw new Error(
            "Invalid Firebase token signature."
        );
    }


    return payload;
}


// ============================================================
// CLOUDINARY UPLOAD
// ============================================================

async function uploadToCloudinary(
    file,
    env,
    userId,
    referralId,
    childName,
    fileType
) {

    // --------------------------------------------------------
    // Validate file
    // --------------------------------------------------------

    if (
        file.size >
        MAX_FILE_SIZE
    ) {

        throw new Error(
            "File is larger than 10 MB."
        );
    }


    const contentType =
        String(
            file.type || ""
        ).toLowerCase();


    if (
        !ALLOWED_TYPES.includes(
            contentType
        )
    ) {

        throw new Error(
            "Only PDF, JPG, PNG and WEBP files are allowed."
        );
    }


    // --------------------------------------------------------
    // Child photo must be image
    // --------------------------------------------------------

    if (
        fileType === "child_photo" &&
        !contentType.startsWith(
            "image/"
        )
    ) {

        throw new Error(
            "Child Photo must be an image."
        );
    }


    // --------------------------------------------------------
    // Secure filename
    // --------------------------------------------------------

    const originalName =
        sanitizeFileName(
            file.name
        );


    const extension =
        getExtension(
            originalName,
            contentType
        );


    const safeUserId =
        sanitizePathPart(
            userId
        );


    const safeReferralId =
        sanitizePathPart(
            referralId
        );


    const safeChild =
        sanitizePathPart(
            childName || "child"
        );


    const random =
        randomId();


    // --------------------------------------------------------
    // IMPORTANT:
    //
    // Do NOT put Aadhaar / DOB / mobile / full personal data
    // inside public_id.
    // --------------------------------------------------------

    const publicId =
        `rbsk/referrals/${safeUserId}/` +
        `${safeReferralId}/` +
        `${fileType}_${random}`;


    // --------------------------------------------------------
    // Cloudinary upload endpoint
    // --------------------------------------------------------

    const uploadUrl =
        `https://api.cloudinary.com/v1_1/` +
        `${CLOUDINARY_CLOUD_NAME}/auto/upload`;


    const formData =
        new FormData();


    formData.append(
        "file",
        file
    );


    formData.append(
        "public_id",
        publicId
    );


    formData.append(
        "type",
        "authenticated"
    );


    formData.append(
        "use_filename",
        "false"
    );


    formData.append(
        "overwrite",
        "false"
    );


    formData.append(
        "unique_filename",
        "true"
    );


    // --------------------------------------------------------
    // Cloudinary server authentication
    // --------------------------------------------------------

    const apiKey =
        env.287293212934469;


    const apiSecret =
        env.7PNse0VxICQn_seWHLG5mapbxCc;


    if (
        !apiKey ||
        !apiSecret
    ) {

        throw new Error(
            "Cloudinary Worker secrets are not configured."
        );
    }


    const basicAuth =
        btoa(
            `${apiKey}:${apiSecret}`
        );


    const response =
        await fetch(
            uploadUrl,
            {
                method:
                    "POST",

                headers: {
                    "Authorization":
                        `Basic ${basicAuth}`
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
        !data.public_id
    ) {

        console.error(
            "Cloudinary response:",
            data
        );

        throw new Error(
            data.error?.message ||
            `Cloudinary upload failed (${response.status}).`
        );
    }


    // --------------------------------------------------------
    // Generate secure signed URL
    // --------------------------------------------------------

    const secureUrl =
        await createAuthenticatedUrl(
            data,
            env
        );


    return {

        url:
            secureUrl,

        secureUrl:
            secureUrl,

        publicId:
            data.public_id ||
            publicId,

        resourceType:
            data.resource_type ||
            "image",

        format:
            data.format ||
            extension,

        originalFilename:
            originalName,

        bytes:
            file.size,

        type:
            fileType,

        version:
            data.version ||
            null
    };
}


// ============================================================
// UPLOAD ENDPOINT
// ============================================================

async function handleUpload(
    request,
    env
) {

    // --------------------------------------------------------
    // Authenticate Firebase user
    // --------------------------------------------------------

    const firebaseUser =
        await verifyFirebaseToken(
            request,
            env
        );


    const authenticatedUid =
        firebaseUser.sub;


    // --------------------------------------------------------
    // Read multipart form
    // --------------------------------------------------------

    const formData =
        await request.formData();


    const file =
        formData.get(
            "file"
        );


    if (
        !file ||
        typeof file === "string"
    ) {

        throw new Error(
            "No file received."
        );
    }


    const referralId =
        String(
            formData.get(
                "referralId"
            ) || ""
        ).trim();


    const childName =
        String(
            formData.get(
                "childName"
            ) || "child"
        ).trim();


    const fileType =
        String(
            formData.get(
                "fileType"
            ) || "document"
        ).trim();


    // --------------------------------------------------------
    // Referral ID is mandatory
    // --------------------------------------------------------

    if (!referralId) {

        throw new Error(
            "Referral ID is required."
        );
    }


    // --------------------------------------------------------
    // Allowed file types
    // --------------------------------------------------------

    if (
        fileType !==
            "child_photo" &&
        fileType !==
            "document"
    ) {

        throw new Error(
            "Invalid file type."
        );
    }


    // --------------------------------------------------------
    // Upload
    // --------------------------------------------------------

    return await uploadToCloudinary(
        file,
        env,
        authenticatedUid,
        referralId,
        childName,
        fileType
    );
}


// ============================================================
// HEALTH
// ============================================================

function healthResponse(
    request
) {

    return jsonResponse(
        {
            success:
                true,

            service:
                "Shree RBSK Secure Cloudinary Worker",

            status:
                "online"
        },
        200,
        request
    );
}


// ============================================================
// MAIN
// ============================================================

export default {

    async fetch(
        request,
        env
    ) {

        const url =
            new URL(
                request.url
            );


        // ----------------------------------------------------
        // OPTIONS / CORS
        // ----------------------------------------------------

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status:
                        204,

                    headers:
                        corsHeaders(
                            request
                        )
                }
            );
        }


        // ----------------------------------------------------
        // HEALTH
        // ----------------------------------------------------

        if (
            url.pathname ===
                "/" ||
            url.pathname ===
                "/health"
        ) {

            return healthResponse(
                request
            );
        }


        // ----------------------------------------------------
        // UPLOAD
        // ----------------------------------------------------

        if (
            url.pathname ===
            "/upload"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return jsonResponse(
                    {
                        success:
                            false,

                        message:
                            "Method not allowed."
                    },
                    405,
                    request
                );
            }


            try {

                const result =
                    await handleUpload(
                        request,
                        env
                    );


                return jsonResponse(
                    {
                        success:
                            true,

                        message:
                            "File uploaded securely.",

                        ...result
                    },
                    200,
                    request
                );


            } catch (error) {

                console.error(
                    "Secure upload error:",
                    error
                );


                return jsonResponse(
                    {
                        success:
                            false,

                        message:
                            error.message ||
                            "Upload failed."
                    },
                    400,
                    request
                );
            }
        }


        // ----------------------------------------------------
        // NOT FOUND
        // ----------------------------------------------------

        return jsonResponse(
            {
                success:
                    false,

                message:
                    "Endpoint not found."
            },
            404,
            request
        );
    }
};
