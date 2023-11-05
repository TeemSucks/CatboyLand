function sendFriendRequest(senderUserId, recipientUserId) {
    const requestData = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ senderUserId: senderUserId, recipientUserId: recipientUserId }),
    };
  
    fetch('/api/send-friendrequest', requestData)
      .then((response) => {
        if (response.ok) {
          console.log('Friend request sent successfully');
          // You can update the button text or style here if needed
          document.getElementById('send-friend-request-button').innerText = 'Friend request sent';
        } else {
          console.error('Error sending friend request');
        }
      })
      .catch((error) => {
        console.error('Network error:', error);
      });
  }

function acceptFriendRequest(userId) {
fetch(`/api/accept-friendrequest/${userId}`, {
    method: 'POST',
    headers: {
    'Content-Type': 'application/json',
    },
})
    .then((response) => {
    if (response.ok) {
        // Request accepted successfully, update the button or UI as needed
        // For example, change the button text or disable it
        console.log('Friend request accepted successfully.');
    } else {
        console.error('Failed to accept friend request.');
    }
    })
    .catch((error) => {
    console.error('Error:', error);
    });
}

function removeFriend(userId) {
fetch(`/api/remove-friend/${userId}`, {
    method: 'POST',
    headers: {
    'Content-Type': 'application/json',
    },
})
    .then((response) => {
    if (response.ok) {
        // Friend removed successfully, update the button or UI as needed
        // For example, change the button text or disable it
        console.log('Friend removed successfully.');
    } else {
        console.error('Failed to remove friend.');
    }
    })
    .catch((error) => {
    console.error('Error:', error);
    });
}