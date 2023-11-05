document.getElementById("loginButton").addEventListener("click", function() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const data = {
        username: username,
        password: password
    };

    fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            return response.json().then(errorData => {
                throw new Error(errorData.message);
            });
        }
    })
    .then(responseData => {
        if (responseData.success) {
            document.getElementById("result").innerHTML = 'Login successful';
            location.reload();
        } else if (responseData.error) {
            document.getElementById("result").innerHTML = 'Error: ' + responseData.error;
        } else {
            document.getElementById("result").innerHTML = 'Authentication failed';
        }
    })
    .catch(error => {
        console.error("Error:", error);
        document.getElementById("result").innerHTML = 'Error: ' + error.message;
    });
});

function togglePassword() {
    var x = document.getElementById("password");
    if (x.type === "password") {
        x.type = "text";
        document.getElementById("visibilityIcon").src = "/cdn/files/svgs/visible.svg"; // Replace with the actual URL
    } else {
        x.type = "password";
        document.getElementById("visibilityIcon").src = "/cdn/files/svgs/hidden.svg"; // Replace with the actual URL
    }
}
