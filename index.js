import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
function toSentenceCase(str) {
    // Split the string into the first letter and the rest of the string
    let firstLetter = str.charAt(0).toUpperCase();
    let restOfString = str.slice(1).toLowerCase();
    // Concatenate the first letter with the rest of the string
    return firstLetter + restOfString;
}


const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "dbms",
    password: "keshav123",
    port: 5432,
});
db.connect();
function generateRandomPNR() {
    let pnr = '';
    for (let i = 0; i < 7; i++) {
        pnr += Math.floor(Math.random() * 10); // Generates random digit from 0 to 9
    }
    return pnr;
}
const app = express()
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
const port = 3000;
//searching flights
app.post("/search", async (req, res) => {
    let src = toSentenceCase(req.body.source)
    let dest = toSentenceCase(req.body.destination)


    const dt = new Date(req.body.date);
    const formattedDate = dt.toISOString().split('T')[0];
    
    try {
        let s = await db.query("select airport_id from airport where loc=($1)", [src])
        let d = await db.query("select airport_id from airport where loc=($1)", [dest])

        s = s.rows[0].airport_id
        d = d.rows[0].airport_id
        // console.log(s)

        let f = await db.query(" select * from flight f,airplane a , flight_seat fs where f.src=($1) and f.dst=($2) and f.date=($3) and f.aid=a.aid and f.fid= fs.fid order by f.fid ", [s, d, formattedDate])
        let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.src=($1) and f.dst=($2) and f.date=($3) and f.aid=a.aid and f.fid= fs.fid order by f.fid", [s, d, formattedDate])

        console.log(f.rows)
        // console.log(sl.rows)
        const data = sl.rows;
        const seatsArray = data.map(obj => Object.values(obj)[0]);

        console.log(seatsArray);
        res.render("flight.ejs", { flights: f.rows, seatCounts: seatsArray })

    } catch (e) {
        console.log("ENTER correct details please")

        res.render("flight.ejs", { flights: [], seatCounts: [] })
    }


})

//booking 
app.post("/confirm-booking", async (req, res) => {
    const randomPNR = generateRandomPNR();
    console.log(randomPNR)
    let fl = req.body.flightId
    let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.fid=($1) and f.aid=a.aid and f.fid= fs.fid ", [fl])
    console.log(sl.rows[0])
    try {
        await db.query("call insert_ticket($1 ,$2,$3,$4) ", [randomPNR, req.body.flightId, req.body.SpecialServices, req.body.passengerType])
    } catch (e) {
        console.log(e)
    }
    let s = await db.query("select seat_filled from flight_seat where fid =$1", [req.body.flightId])
    // console.log(s)
    s = s.rows[0].seat_filled
    // console.log(s)
    let { headPassengerName, headPassengerContact, headPassengerAge, headPassengerGender, numberOfPassengers } = req.body;
    s = s + 1;
    try {

        await db.query('INSERT INTO passenger (pnr, name, gender, seat_no, age, contact) VALUES ($1, $2, $3, $4, $5, $6)', [randomPNR, headPassengerName, headPassengerGender, s, headPassengerAge, headPassengerContact]);
        for (let i = 1; i <= numberOfPassengers; i++) {
            const passengerName = req.body[`passengerName${i}`];
            const passengerContact = req.body[`passengerContact${i}`];
            const passengerAge = req.body[`passengerAge${i}`];
            const passengerGender = req.body[`passengerGender${i}`];
            s = s + 1;
            const passengerSeatNo = s;
            await db.query('INSERT INTO passenger (pnr, name, gender, seat_no, age, contact) VALUES ($1, $2, $3, $4, $5, $6)', [randomPNR, passengerName, passengerGender, passengerSeatNo, passengerAge, passengerContact]);
        }
        await db.query("call updat_seat($1,$2)", [s, req.body.flightId])
    } catch (e) {
        console.log(e)
    }
    let f = await db.query("select * from flight where fid =$1", [req.body.flightId])
    f = f.rows[0]
    console.log(f.src)

    let dst = await db.query("select loc from airport where airport_id=$1", [f.dst])
    let src = await db.query("select loc from airport where airport_id=$1", [f.src])

    console.log(src.rows[0].loc)

    res.render("ticket.ejs", { b: f, head_passenger: headPassengerName, num_passenger: parseInt(numberOfPassengers) + 1, pnr: randomPNR, src: src.rows[0].loc, dst: dst.rows[0].loc })
})


//updating the date 
app.post("/update-flight", async (req, res) => {
    let pnr = req.body.pnr
    try {
        let old_f = await db.query(" select f_id from ticket where pnr=($1)", [pnr])
        old_f = old_f.rows[0].f_id
        // console.log(old_f)
        let old_src = await db.query("select src from flight where fid =$1", [old_f])
        let old_dst = await db.query("select dst from flight where fid=$1", [old_f])
        old_src = old_src.rows[0].src
        old_dst = old_dst.rows[0].dst

        let new_f = await db.query(" select fid from flight where src=$1 and dst=$2 and date = $3", [old_src, old_dst, req.body.newDate])
        
        if (!new_f.rows.length) {
            return res.render("no_update.ejs");
        }
        new_f = new_f.rows[0].fid

        await db.query("call update_flight($1, $2)", [pnr, new_f])
        let f = await db.query("select * from flight where fid= $1", [new_f])
        f = f.rows[0]
        let headp = await db.query(" select * from passenger where pnr=$1", [pnr])
        headp = headp.rows[0].name
        let num_passenger = await db.query("select count(*) from passenger where pnr=$1", [pnr])
        num_passenger = num_passenger.rows[0].count
        console.log(num_passenger)
        let dst = await db.query("select loc from airport where airport_id=$1", [f.dst])
        let src = await db.query("select loc from airport where airport_id=$1", [f.src])
        // console.log(src)
        dst = dst.rows[0].loc
        src = src.rows[0].loc

        res.render("ticket.ejs", { b: f, head_passenger: headp, num_passenger: num_passenger, pnr: pnr, src: src, dst: dst })
    } catch (e) {
        res.render("no_ticket.ejs")
    }

})

app.get("/", async (req, res) => {
    res.render("front.ejs")


})
app.get("/flight_search", (req, res) => {
    res.render("search.ejs")
})
app.get("/update", (req, res) => {
    res.render("update.ejs")
})
app.get("/delete", (req, res) => {
    res.render("delete.ejs")
})
app.get("/view", (req, res) => {
    res.render("view.ejs")
})
app.get("/admin", (req, res) => {
    res.render("admin.ejs")
})
app.get("/search_source", (req, res) => {
    res.render("search_source.ejs")
})
app.get("/search_destination", (req, res) => {
    res.render("search_destination.ejs")
})
app.get("/search_date", (req, res) => {
    res.render("search_date.ejs")
})
app.get("/search_pass", (req, res) => {
    res.render("search_pass.ejs")
})
app.get("/view_pass", async (req, res) => {
    console.log(req.query.flightId)
    let f = req.query.flightId
    let pass = await db.query("select * from ticket t , passenger p where t.pnr=p.pnr and t.f_id=$1", [f])
    console.log(pass.rows)
    let flight = await db.query("select * from flight where fid=$1", [f])
    flight = flight.rows[0]
    let dst = await db.query("select loc from airport where airport_id=$1", [flight.dst])
    let src = await db.query("select loc from airport where airport_id=$1", [flight.src])
    // console.log(src)
    dst = dst.rows[0].loc
    src = src.rows[0].loc
    res.render("passengers.ejs", { flightDetails: flight, src: src, dst: dst, passengers: pass.rows })
})
app.post("/source", async (req, res) => {
    let src = toSentenceCase(req.body.source)
    console.log(src)
    try {
        let s = await db.query("select airport_id from airport where loc=($1)", [src])

        // console.log(s.rows[0])
        s = s.rows[0].airport_id

        // console.log(s)

        let f = await db.query(" select * from flight f where  f.src=($1) order by f.fid  ", [s])
        let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.src=($1)  and f.aid=a.aid and f.fid= fs.fid order by f.fid ", [s])

        // console.log(f.rows)
        // console.log(sl.rows)


        const data = sl.rows;

        const seatsArray = data.map(obj => Object.values(obj)[0]);

        // console.log(seatsArray);
        res.render("admin_flight.ejs", { flights: f.rows, seatCounts: seatsArray })

    } catch (e) {
        console.log("ENTER correct details please")

        res.render("flight.ejs", { flights: [], seatCounts: [] })
    }
})
app.post("/destination", async (req, res) => {
    let dst = toSentenceCase(req.body.destination)
    console.log(dst)
    try {
        let s = await db.query("select airport_id from airport where loc=($1)", [dst])

        // console.log(s.rows[0])
        s = s.rows[0].airport_id

        // console.log(s)

        let f = await db.query(" select * from flight f where  f.dst=($1) order by f.fid  ", [s])
        let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.dst=($1)  and f.aid=a.aid and f.fid= fs.fid order by f.fid ", [s])

        // console.log(f.rows)
        // console.log(sl.rows)


        const data = sl.rows;

        const seatsArray = data.map(obj => Object.values(obj)[0]);

        // console.log(seatsArray);
        res.render("admin_flight.ejs", { flights: f.rows, seatCounts: seatsArray })

    } catch (e) {
        console.log("ENTER correct details please")

        res.render("flight.ejs", { flights: [], seatCounts: [] })
    }
})
app.post("/date", async (req, res) => {
    let date = toSentenceCase(req.body.date)
    console.log(date)
    try {


        // console.log(s.rows[0])


        // console.log(s)

        let f = await db.query(" select * from flight f where  f.date=($1) order by f.fid  ", [date])
        let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.aid=a.aid and f.date=($1)   and f.fid= fs.fid order by f.fid", [date])

        // console.log(f.rows)
        console.log(sl.rows)


        const data = sl.rows;

        const seatsArray = data.map(obj => Object.values(obj)[0]);

        // console.log(seatsArray);
        res.render("admin_flight.ejs", { flights: f.rows, seatCounts: seatsArray })

    } catch (e) {
        console.log("ENTER correct details please")

        res.render("flight.ejs", { flights: [], seatCounts: [] })
    }
})
app.post("/view-ticket", async (req, res) => {
    let p = await db.query("select * from passenger where pnr=$1", [req.body.pnr])
    p = p.rows
    try {
        let f = await db.query("select f_id from ticket where pnr=$1", [req.body.pnr])
        f = f.rows[0].f_id
        // console.log(f)
        let flight = await db.query("select * from flight where fid=$1", [f])
        flight = flight.rows[0]
        let dst = await db.query("select loc from airport where airport_id=$1", [flight.dst])
        let src = await db.query("select loc from airport where airport_id=$1", [flight.src])
        // console.log(src)
        dst = dst.rows[0].loc
        src = src.rows[0].loc
        res.render("passengers.ejs", { flightDetails: flight, src: src, dst: dst, passengers: p })
    }
    catch (e) {
        res.render("no_ticket.ejs")
    }
})

app.post("/delete-ticket", async (req, res) => {
    let pnr = req.body.pnr;
    await db.query("delete from ticket where pnr=$1", [pnr]);
    res.render("deleted.ejs")
})

app.get("/book", async (req, res) => {
    // console.log(req.query.flightId)
    let f = await db.query("select * from flight where fid=($1) ", [req.query.flightId])
    let sl = await db.query(" select a.capacity-fs.seat_filled as seat_left from flight f,airplane a , flight_seat fs where f.fid=($1) and f.aid=a.aid and f.fid= fs.fid ", [req.query.flightId])
    console.log(sl.rows)


    res.render("booking2.ejs", { flightId: req.query.flightId, seats_left: parseInt(sl.rows[0].seat_left) - 1 })
})

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});