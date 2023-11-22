document.getElementById("invite-button").addEventListener("click", function() {
    const inviteCode = document.getElementById("username").value;

    const data = {
        inviteCode: inviteCode
    };

    fetch("/api/sin/use-invite", {
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
        console.log(responseData);
    })
    .catch(error => {
        console.error("Error:", error);
        document.getElementById("result").innerHTML = 'Error: ' + error.message;
    });
});