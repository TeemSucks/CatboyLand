document.addEventListener('DOMContentLoaded', () => {
    const postButton = document.getElementById('postButton');
    const messageForm = document.getElementById('messageForm');

    postButton.addEventListener('click', async e => {
      const formData = new FormData(messageForm);
      const messageContent = formData.get('messageContent');
      //const messageFile = formData.get('uploadFile');
      console.log(messageContent)

      if (!messageContent /*|| !messageFile*/) {
        return alert('Message content is required.');
      }

      try {
        e.preventDefault();
        const response = await fetch('/api/post-message', {
          method: 'POST',
          headers: {
            "accept": "*/*",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            'Content-Type': 'application/json',
            "Access-Control-Allow-Origin": "*"
          },
          "referrer": `${window.origin}/home`,
          body: JSON.stringify({ messageContent }),
        });

        const data = await response.json();

        if (data.success) {
          console.log('Message posted successfully.');
          messageForm.reset();
          window.location.reload(true);
        } else {
          console.error('Failed to post message:', data.message);
        }
      } catch (error) {
        console.error('Error posting message:', error);
      }
    });


    const deleteButtons = document.querySelectorAll('.delete-button');

    deleteButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            const messageId = button.getAttribute('data-message-id');

            try {
                const response = await fetch(`/api/delete-message/${messageId}`, {
                    method: 'DELETE',
                }).then(response => location.reload());

                const data = await response.json();

                if (data.success) {
                    console.log('Message deleted successfully.');
                    // You can update the UI to remove the deleted message here
                } else {
                    console.error('Failed to delete message:', data.message);
                }
            } catch (error) {
                console.error('Error deleting message:', error);
            }
            location.reload();
            window.location.reload(true);
        });
    });

    // setTimeout(() => {
    //   location.reload();
    // }, 30000);
  });

const postButton = document.getElementById('postButton');
const deleteButton = document.getElementById('postButton');
postButton.addEventListener('click', function () {
  setTimeout(function () {
    location.reload();
}, 1000);
});

deleteButton.addEventListener('click', function () {
  setTimeout(function () {
    location.reload();
  }, 1000);
});