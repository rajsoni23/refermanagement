// ============================================================
// RBSK FILE STORAGE - CLOUDFLARE R2 WORKER
// ============================================================

const ALLOWED_ORIGINS = [
    "https://YOUR-DOMAIN.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

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

function getCorsOrigin(request) {

    const origin =
        request.headers.get("Origin") || "";

    if (
        ALLOWED_ORIGINS.includes(origin)
    ) {
        return origin;
    }

    return ALLOWED_ORIGINS[0];
}


function corsHeaders(request) {

    return {
        "Access-Control-Allow-Origin":
            getCorsOrigin(request),

        "Access-Control-Allow-Methods":
            "POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization",

        "Access-Control-Max-Age":
            "86400"
    };
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
// SANITIZE FILE NAME
// ============================================================

function sanitizeFileName(name) {

    return String(name || "file")
        .replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
        )
        .replace(
            /_+/g,
            "_"
        )
        .slice(0, 150);
}


// ============================================================
// EXTENSION
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
// UNIQUE KEY
// ============================================================

function createObjectKey(
    fileName,
    childName
) {

    const cleanChild =
        sanitizeFileName(
            childName ||
            "child"
        );

    const cleanFile =
        sanitizeFileName(
            fileName ||
            "file"
        );

    const timestamp =
        Date.now();

    const random =
        crypto.randomUUID();


    return [
        "rbsk",
        cleanChild,
        `${timestamp}-${random}-${cleanFile}`
    ].join("/");
}


// ============================================================
// HEALTH CHECK
// ============================================================

function healthResponse(request) {

    return jsonResponse(
        {
            success: true,
            service: "RBSK R2 Storage",
            status: "online"
        },
        200,
        request
    );
}


// ============================================================
// UPLOAD
// ============================================================

async function uploadFile(
    request,
    env
) {

    const contentLength =
        Number(
            request.headers.get(
                "Content-Length"
            ) || 0
        );


    if (
        contentLength &&
        contentLength > MAX_FILE_SIZE
    ) {

        return jsonResponse(
            {
                success: false,
                message:
                    "File is too large. Maximum size is 15 MB."
            },
            413,
            request
        );
    }


    const formData =
        await request.formData();


    const file =
        formData.get("file");


    if (
        !file ||
        typeof file === "string"
    ) {

        return jsonResponse(
            {
                success: false,
                message:
                    "No file received."
            },
            400,
            request
        );
    }


    // ========================================================
    // FILE SIZE
    // ========================================================

    if (
        file.size >
        MAX_FILE_SIZE
    ) {

        return jsonResponse(
            {
                success: false,
                message:
                    "File is too large. Maximum size is 15 MB."
            },
            413,
            request
        );
    }


    // ========================================================
    // FILE TYPE
    // ========================================================

    const contentType =
        String(
            file.type || ""
        ).toLowerCase();


    if (
        !ALLOWED_TYPES.includes(
            contentType
        )
    ) {

        return jsonResponse(
            {
                success: false,
                message:
                    "Only PDF, JPG, PNG and WEBP files are allowed."
            },
            415,
            request
        );
    }


    // ========================================================
    // FORM DATA
    // ========================================================

    const childName =
        String(
            formData.get(
                "childName"
            ) || "child"
        );

    const userId =
        String(
            formData.get(
                "userId"
            ) || "unknown"
        );

    const referralId =
        String(
            formData.get(
                "referralId"
            ) || "unknown"
        );


    // ========================================================
    // FILE NAME
    // ========================================================

    const extension =
        getExtension(
            file.name,
            contentType
        );


    const safeOriginalName =
        sanitizeFileName(
            file.name
        );


    const key =
        createObjectKey(
            safeOriginalName,
            childName
        );


    // ========================================================
    // R2 METADATA
    // ========================================================

    const metadata = {

        "Content-Type":
            contentType,

        "Cache-Control":
            "private, max-age=31536000",

        "X-RBSK-Child":
            childName,

        "X-RBSK-User":
            userId,

        "X-RBSK-Referral":
            referralId
    };


    // ========================================================
    // UPLOAD TO R2
    // ========================================================

    await env.RBSK_BUCKET.put(
        key,
        file.stream(),
        {
            httpMetadata: {
                contentType:
                    contentType,

                cacheControl:
                    metadata[
                        "Cache-Control"
                    ]
            },

            customMetadata: {
                childName:
                    childName,

                userId:
                    userId,

                referralId:
                    referralId,

                originalFileName:
                    safeOriginalName,

                uploadedAt:
                    new Date()
                        .toISOString()
            }
        }
    );


    // ========================================================
    // PUBLIC FILE URL
    // ========================================================
    //
    // IMPORTANT:
    // Set R2_PUBLIC_URL in Worker environment variables.
    //
    // Example:
    //
    // https://files.example.com
    //
    // ========================================================

    let publicUrl = "";


    if (env.R2_PUBLIC_URL) {

        publicUrl =
            `${env.R2_PUBLIC_URL.replace(
                /\/$/,
                ""
            )}/${key}`;
    }


    // ========================================================
    // SUCCESS
    // ========================================================

    return jsonResponse(
        {
            success: true,

            message:
                "File uploaded successfully.",

            key,

            fileName:
                safeOriginalName,

            extension,

            contentType,

            size:
                file.size,

            url:
                publicUrl
        },
        200,
        request
    );
}


// ============================================================
// DELETE FILE
// ============================================================
//
// Optional future endpoint.
// Currently disabled from public POST API.
//

async function deleteFile(
    request,
    env
) {

    return jsonResponse(
        {
            success: false,
            message:
                "Delete endpoint is not enabled."
        },
        405,
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


        // ======================================================
        // CORS PREFLIGHT
        // ======================================================

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status: 204,

                    headers:
                        corsHeaders(
                            request
                        )
                }
            );
        }


        // ======================================================
        // HEALTH
        // ======================================================

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


        // ======================================================
        // UPLOAD
        // ======================================================

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
                        success: false,
                        message:
                            "Method not allowed."
                    },
                    405,
                    request
                );
            }


            try {

                return await uploadFile(
                    request,
                    env
                );

            } catch (error) {

                console.error(
                    "R2 upload error:",
                    error
                );


                return jsonResponse(
                    {
                        success: false,

                        message:
                            "Upload failed.",

                        error:
                            error.message
                    },
                    500,
                    request
                );
            }
        }


        // ======================================================
        // DELETE
        // ======================================================

        if (
            url.pathname ===
                "/delete"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return jsonResponse(
                    {
                        success: false,
                        message:
                            "Method not allowed."
                    },
                    405,
                    request
                );
            }


            return deleteFile(
                request,
                env
            );
        }


        // ======================================================
        // NOT FOUND
        // ======================================================

        return jsonResponse(
            {
                success: false,
                message:
                    "Endpoint not found."
            },
            404,
            request
        );
    }
};
