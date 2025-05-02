const userId = localStorage.getItem("user_id");
const bookingsList = document.getElementById("bookingsList");
const editModal = document.getElementById("editModal");
const newTimeSlot = document.getElementById("newTimeSlot");
const toast = document.getElementById("toast");

let editingBookingId = null;

// Load user's bookings
function loadBookings() {
  fetch(`http://localhost:5000/my-bookings/${userId}`)
    .then(res => res.json())
    .then(bookings => {
      bookingsList.innerHTML = '';

      if (bookings.length === 0) {
        bookingsList.innerHTML = '<p>No bookings yet.</p>';
        return;
      }

      bookings.forEach(booking => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="${booking.status === 'Confirmed' ? 'confirmed' : 'cancelled'}">
            <strong>${booking.date}</strong> | ${booking.time_slot}
          </span>
          <div>
            <button class="edit" onclick="openEdit(${booking.id}, '${booking.date}')">Edit</button>
            <button class="delete" onclick="deleteBooking(${booking.id})">Delete</button>
          </div>
        `;
        bookingsList.appendChild(li);
      });
    });
}

// Open edit modal
function openEdit(id, date) {
  editingBookingId = id;
  editModal.style.display = "flex";

  fetch(`http://localhost:5000/available-times/${date}`)
    .then(res => res.json())
    .then(times => {
      newTimeSlot.innerHTML = times.length
        ? times.map(slot => `<option value="${slot}">${slot}</option>`).join("")
        : `<option disabled>No available slots</option>`;
    });
}

// Confirm edit
function confirmEdit() {
  const selectedTime = newTimeSlot.value;

  if (!selectedTime) {
    showToast("No time selected!");
    return;
  }

  fetch(`http://localhost:5000/update-booking/${editingBookingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time_slot: selectedTime })
  })
    .then(res => res.json())
    .then(data => {
      showToast(data.message);
      closeModal();
      loadBookings();
    });
}

// Delete booking
function deleteBooking(id) {
  if (!confirm("Are you sure you want to cancel this booking?")) return;

  fetch(`http://localhost:5000/cancel-booking/${id}`, {
    method: "DELETE"
  })
    .then(res => res.text())
    .then(msg => {
      showToast(msg);
      loadBookings();
    });
}

// Close modal
function closeModal() {
  editModal.style.display = "none";
  editingBookingId = null;
}

// Toast popup
function showToast(message) {
  toast.innerText = message;
  toast.className = "show";
  setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

// Initial load
loadBookings();

// Auto-refresh every 2 minutes
setInterval(loadBookings, 120000);