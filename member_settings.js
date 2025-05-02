// Profile picture upload
document.getElementById("profileForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const formData = new FormData();
    const file = document.getElementById("profilePic").files[0];
    formData.append("profile_picture", file);

    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:5000/update-profile-picture", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });

    const data = await res.json();
    alert(data.message);
});

// Password change
document.getElementById("passwordForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;

    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:5000/change-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    alert(data.message);
});

// Language preference
document.getElementById("languageSelect").addEventListener("change", (e) => {
    const selectedLang = e.target.value;
    localStorage.setItem("preferredLanguage", selectedLang);
    alert(`Language set to: ${selectedLang}`);
});

// Equipment issue report (with image)
document.getElementById("reportForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const reportText = document.getElementById("reportText").value;
    const imageFile = document.getElementById("reportImage").files[0];

    const formData = new FormData();
    formData.append("report", reportText);
    if (imageFile) {
        formData.append("image", imageFile);
    }

    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:5000/report-issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });

    const data = await res.json();
    alert(data.message);
    document.getElementById("reportForm").reset();
});
