const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ObjectId, MongoClient, ServerApiVersion } = require("mongodb");
const admin = require("firebase-admin");

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.actwx8z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    //collection
    const db = client.db("Real_State_db");
    const usersCollection = db.collection("users");
    const propertiesCollection = db.collection("properties");
    const wishlistCollection = db.collection("wishlist");
    const reviewsCollection = db.collection("reviews");
    const advertisementsCollection = db.collection("advertise");
    const reportsCollection = db.collection("reports");
    const offersCollection = db.collection("offers");
    const paymentsCollection = db.collection("payments");

    // custom middlewares

    // verify firebase token
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      //verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // verify agent
    const verifyAgent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "agent") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get all users
    app.get("/users", verifyFBToken, async (req, res) => {
      try {
        const result = await usersCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching user", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // manage users's api's for admin
    // make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "admin" } }
        );
        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to make admin" });
      }
    });

    // make agent
    app.patch("/users/agent/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "agent" } }
        );
        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to make agent" });
      }
    });

    // mark as fraud
    app.patch("/users/fraud/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isFraud: true } }
        );
        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to mark fraud" });
      }
    });

    //  delete all properties of fraud agent
    app.delete("/properties/by-email/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const result = await propertiesCollection.deleteMany({
          agentEmail: email,
        });
        res.json({ deletedCount: result.deletedCount });
      } catch (err) {
        res.status(500).json({ error: "Failed to delete properties" });
      }
    });

    // delete user
    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res.json({ success: true });
        } else {
          res.status(404).json({ error: "User not found" });
        }
      } catch (err) {
        res.status(500).json({ error: "Failed to delete user" });
      }
    });

    // post user info
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // find user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const user = await usersCollection.findOne(
          { email },
          { projection: { role: 1 } } // Only fetch the role field
        );

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" }); // Default to "user" if no role
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // update user name
    app.patch("/users/updateName", async (req, res) => {
      try {
        const { email, displayName } = req.body;

        if (!email || !displayName) {
          return res
            .status(400)
            .json({ message: "Email and displayName are required" });
        }

        const result = await usersCollection.updateOne(
          { email: email },
          { $set: { displayName: displayName } }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Display name updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "User not found or already has this name" });
        }
      } catch (error) {
        console.error("Error updating display name:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // added user media links
    app.patch("/users", async (req, res) => {
      try {
        const { applicant, facebook, twitter, whatsapp } = req.body;

        if (!applicant) {
          return res.status(400).json({ error: "Applicant email is required" });
        }

        const result = await usersCollection.updateOne(
          { email: applicant },
          {
            $set: { facebook, twitter, whatsapp },
          }
        );

        console.log("Update result:", result);
        res.json(result);
      } catch (error) {
        console.error("PATCH /users error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // GET /users/socials?email=user@example.com
    app.get("/users/socials", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const user = await usersCollection.findOne(
          { email },
          {
            projection: {
              _id: 0,
              facebook: 1,
              twitter: 1,
              whatsapp: 1,
            },
          }
        );

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(user); // returns { facebook, twitter, whatsapp }
      } catch (error) {
        console.error("GET /users/socials error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // POST /addProperties
    app.post("/addProperties", async (req, res) => {
      try {
        const property = req.body;

        if (
          !property.title ||
          !property.location ||
          !property.image ||
          !property.agentName ||
          !property.agentEmail ||
          !property.agentImage ||
          !property.minRate ||
          !property.maxRate
        ) {
          return res
            .status(400)
            .json({ error: "All required fields must be provided." });
        }

        property.minRate = Number(property.minRate);
        property.maxRate = Number(property.maxRate);

        property.status = "available";
        property.createdAt = new Date();

        const result = await propertiesCollection.insertOne(property);
        res.status(201).json({
          message: "Property added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to add property:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //get added property of a single agent
    app.get("/properties", async (req, res) => {
      try {
        const { agentEmail } = req.query;

        let query = {};
        if (agentEmail) {
          query.agentEmail = agentEmail;
        }

        const properties = await propertiesCollection.find(query).toArray();
        res.send(properties);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // get all pending properties on admin manage properties
    app.get(
      "/manage-properties",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const result = await propertiesCollection
            .find({ status: "available" }) // 'available' means not yet verified or rejected
            .toArray();
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: "Failed to fetch properties" });
        }
      }
    );

    // update property by agent
    app.patch("/properties/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;

        updatedData.installments = Number(updatedData.installments);

        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.json({ message: "Property updated successfully" });
      } catch (error) {
        console.error("Failed to update property", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // verify a property from admin manage property
    app.patch("/properties/verify/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "verified" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to verify property" });
      }
    });

    // reject a property from admin manage property
    app.patch("/properties/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to reject property" });
      }
    });

    // reject a offer from agent offered properties
    app.patch("/offers/:id/reject", async (req, res) => {
      const offerId = req.params.id;

      try {
        const result = await offersCollection.updateOne(
          { _id: new ObjectId(offerId) },
          { $set: { status: "rejected" } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "Offer not found or already rejected" });
        }

        res.json({ message: "Offer rejected successfully" });
      } catch (error) {
        console.error("Error rejecting offer:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // get all verified properties
    app.get("/properties/verified", async (req, res) => {
      try {
        const verifiedProperties = await propertiesCollection
          .find({ status: "verified" })
          .toArray();
        res.json(verifiedProperties);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch verified properties" });
      }
    });

    // get all not advertised property
    app.get(
      "/properties/notAdvertised",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const verifiedProperties = await propertiesCollection
            .find({
              status: "verified",
              installments: { $ne: null }, // not null
            })
            .toArray();

          const advertised = await advertisementsCollection
            .find({}, { projection: { propertyId: 1 } })
            .toArray();

          const advertisedIds = advertised.map((ad) =>
            ad.propertyId.toString()
          );

          const notAdvertised = verifiedProperties.filter(
            (property) =>
              !advertisedIds.includes(property._id.toString()) &&
              property.installments // ensure it's not falsy (e.g. 0, undefined)
          );

          res.json(notAdvertised);
        } catch (err) {
          console.error("Error fetching not advertised properties:", err);
          res
            .status(500)
            .json({ error: "Failed to fetch not advertised properties" });
        }
      }
    );

    // GET all advertised property
    app.get("/properties/advertised", async (req, res) => {
      try {
        const ads = await advertisementsCollection.find().toArray();
        res.send(ads);
      } catch (error) {
        console.error("Error fetching advertisements:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // delete advertise property
    app.delete("/properties/advertise/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await advertisementsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount > 0) {
          res.json({ success: true });
        } else {
          res.status(404).json({ error: "Advertisement not found" });
        }
      } catch (err) {
        console.error("Failed to delete advertisement:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // get single property details on property details page
    app.get("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const property = await propertiesCollection.findOne({
          _id: new ObjectId(id),
        });
        res.json(property);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch property details" });
      }
    });

    // delete properties from my properties page
    app.delete("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await propertiesCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).json({
            message: "Property deleted successfully",
            deletedCount: 1,
          });
        } else {
          res
            .status(404)
            .json({ message: "Property not found", deletedCount: 0 });
        }
      } catch (error) {
        console.error("Error deleting property:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // post repots
    app.post("/reports", async (req, res) => {
      try {
        const report = req.body;

        if (!report.propertyId || !report.userEmail || !report.reason) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const result = await reportsCollection.insertOne(report);
        res.status(201).json(result);
      } catch (err) {
        console.error("Error submitting report:", err);
        res.status(500).json({ error: "Failed to submit report" });
      }
    });

    // get report
    app.get("/reports", verifyFBToken, async (req, res) => {
      try {
        const reports = await reportsCollection.find().toArray();
        res.send(reports);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch reports" });
      }
    });

    // delete single report (not reported property) by admin
    // DELETE /reports/:id
    app.delete("/reports/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await reportsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          return res.json({
            success: true,
            message: "Report deleted successfully.",
          });
        } else {
          return res
            .status(404)
            .json({ success: false, message: "Report not found." });
        }
      } catch (err) {
        console.error("Error deleting report:", err);
        res.status(500).json({
          success: false,
          message: "Server error while deleting report.",
        });
      }
    });

    //

    // delete report
    // app.delete("/reports/:propertyId", async (req, res) => {
    //   try {
    //     const propertyId = req.params.propertyId;

    //     const result = await reportsCollection.deleteMany({ propertyId });

    //     res.json({
    //       message: "Associated reports deleted",
    //       deletedCount: result.deletedCount,
    //     });
    //   } catch (error) {
    //     console.error("Failed to delete reports:", error);
    //     res.status(500).json({ error: "Internal Server Error" });
    //   }
    // });

    // DELETE /admin/remove-property/:propertyId
    app.delete("/admin/remove-property/:propertyId", async (req, res) => {
      const propertyId = req.params.propertyId;

      try {
        const objectId = new ObjectId(propertyId);

        const propertyResult = await propertiesCollection.deleteOne({
          _id: objectId,
        });

        if (propertyResult.deletedCount !== 1) {
          return res.json({ success: false, message: "Property not found." });
        }

        const reviewResult = await reviewsCollection.deleteMany({ propertyId });
        const reportResult = await reportsCollection.deleteMany({ propertyId });
        const advertiseResult = await advertisementsCollection.deleteMany({
          propertyId,
        });
        const wishlistResult = await wishlistCollection.deleteMany({
          propertyId,
        });
        const offerResult = await offersCollection.deleteMany({ propertyId });

        res.json({
          success: true,
          reviewsDeleted: reviewResult.deletedCount,
          reportsDeleted: reportResult.deletedCount,
          adsDeleted: advertiseResult.deletedCount,
          wishlistsDeleted: wishlistResult.deletedCount,
          offersDeleted: offerResult.deletedCount,
        });
      } catch (error) {
        console.error("Error in property deletion:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    // get reviews by property ID
    app.get("/reviews", async (req, res) => {
      try {
        const { propertyId } = req.query;

        if (!propertyId) {
          return res
            .status(400)
            .json({ error: "propertyId query is required" });
        }

        const filter = { propertyId };

        const reviews = await reviewsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // post review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;
        review.createdAt = new Date(); // optional: for sorting
        const result = await reviewsCollection.insertOne(review);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to post review" });
      }
    });

    // get latest 4 reviews in reviews section
    app.get("/reviewSection", async (req, res) => {
      try {
        const { propertyId } = req.query;

        const filter = propertyId ? { propertyId } : {};

        const reviews = await reviewsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // GET single user reviews from my reviews
    app.get("/myReviews", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const reviews = await reviewsCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(reviews);
    });

    // GET allReviews
    app.get("/allReviews", verifyFBToken, async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        console.error("Failed to fetch all reviews:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // DELETE single user reviews from my reviews
    app.delete("/myReviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // app.delete("/reviews/:propertyId", async (req, res) => {
    //   try {
    //     const propertyId = req.params.propertyId;

    //     const result = await reviewsCollection.deleteMany({ propertyId });

    //     res.status(200).json({
    //       message: "Associated reviews deleted successfully",
    //       deletedCount: result.deletedCount,
    //     });
    //   } catch (error) {
    //     console.error("Failed to delete reviews:", error);
    //     res.status(500).json({ error: "Internal Server Error" });
    //   }
    // });

    // post offers
    app.post("/offers", async (req, res) => {
      const offerData = req.body;

      if (
        !offerData.propertyId ||
        !offerData.title ||
        !offerData.location ||
        !offerData.image ||
        !offerData.agentName ||
        !offerData.buyerEmail ||
        !offerData.buyerName ||
        !offerData.offerAmount ||
        !offerData.buyingDate
      ) {
        return res
          .status(400)
          .json({ error: "Missing required offer fields." });
      }

      const newOffer = {
        ...offerData,
        status: "pending", // default status
        createdAt: new Date(),
      };

      try {
        const result = await offersCollection.insertOne(newOffer);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Error inserting offer:", err);
        res.status(500).json({ error: "Failed to submit the offer." });
      }
    });

    // get specific user offer or make offer card
    app.get("/offers", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const offers = await offersCollection
          .find({ buyerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(offers);
      } catch (error) {
        console.error("Failed to fetch offers:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // get requested offer for agent
    app.get("/offers/agent", verifyFBToken, verifyAgent, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Agent email query parameter is required" });
        }

        const offers = await offersCollection
          .find({ agentEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(offers);
      } catch (error) {
        console.error("Failed to fetch offers for agent:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // post property to wishlist
    app.post("/wishlist", async (req, res) => {
      try {
        const wishlistItem = req.body;
        const result = await wishlistCollection.insertOne(wishlistItem);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to add to wishlist" });
      }
    });

    // get all wish list on wishList page
    app.get("/wishlist", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .sort({ _id: -1 })
          .toArray();

        res.json(wishlistItems);
      } catch (error) {
        console.error("Failed to fetch wishlist:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // delete from wishlist collection
    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID format" });
      }

      try {
        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount > 0) {
          res.json({ success: true, deletedCount: result.deletedCount });
        } else {
          res
            .status(404)
            .json({ success: false, message: "Wishlist item not found" });
        }
      } catch (error) {
        console.error("Failed to delete wishlist item:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // get offered property on make offer page
    app.get("/offered/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const property = await wishlistCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }

        res.json(property);
      } catch (error) {
        console.error("Error fetching property by ID:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // GET /offers/by-property/:id
    app.get("/offers/by-property/:id", async (req, res) => {
      try {
        const propertyId = req.params.id;

        const offers = await offersCollection
          .find({ propertyId })
          .project({ _id: 1, email: 1, offerAmount: 1, status: 1 })
          .toArray();

        res.send(offers);
      } catch (error) {
        console.error("Failed to get offers for property:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // accept offer
    app.patch("/offers/:id/accept", async (req, res) => {
      const offerId = req.params.id;

      try {
        // 1. Find the accepted offer
        const acceptedOffer = await offersCollection.findOne({
          _id: new ObjectId(offerId),
        });

        if (!acceptedOffer) {
          return res.status(404).json({ error: "Offer not found" });
        }

        const propertyId = acceptedOffer.propertyId;

        // 2. Update the accepted offer
        await offersCollection.updateOne(
          { _id: new ObjectId(offerId) },
          { $set: { status: "accepted" } }
        );

        // 3. Reject all other offers for the same property
        await offersCollection.updateMany(
          {
            _id: { $ne: new ObjectId(offerId) },
            propertyId: propertyId,
          },
          { $set: { status: "rejected" } }
        );

        // 4. Delete property
        await propertiesCollection.deleteOne({ _id: new ObjectId(propertyId) });

        // 5. Delete all reviews related to the property
        await reviewsCollection.deleteMany({ propertyId: propertyId });

        // 6. Delete all reports for the property
        await reportsCollection.deleteMany({ propertyId: propertyId });

        // 7. Delete all wishlist entries for the property
        await wishlistCollection.deleteMany({ propertyId: propertyId });

        // 8. Delete any advertisement for the property
        await advertisementsCollection.deleteMany({ propertyId: propertyId });

        res.json({
          message: "Offer accepted and related data removed successfully",
        });
      } catch (error) {
        console.error("Accept offer error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // GET /offers/accepted/:propertyId
    app.get("/offers/accepted/:propertyId", async (req, res) => {
      try {
        const propertyId = req.params.propertyId;

        const offer = await offersCollection.findOne({
          propertyId: propertyId,
          status: "accepted",
        });

        if (!offer) {
          return res.status(404).json({ message: "Accepted offer not found" });
        }

        res.json(offer);
      } catch (error) {
        console.error("Error fetching accepted offer by propertyId:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const amountInCents = req.body.amountInCents;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "bdt",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // get payments
    app.get("/payments", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      try {
        const payments = await paymentsCollection
          .find({ email: email })
          .toArray();
        res.send(payments);
      } catch (error) {
        console.error("Failed to fetch payments:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.post("/payments", async (req, res) => {
      try {
        const { propertyId, email, amount, transactionId, paymentMethod } =
          req.body;

        const propertyObjectId = new ObjectId(propertyId);

        // 1. Update the offer document where status is "accepted"
        const updateResult = await offersCollection.updateOne(
          {
            propertyId: propertyId,
            status: "accepted",
          },
          {
            $set: {
              status: "paid",
              paid_at: new Date(),
            },
          }
        );

        if (updateResult.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "No accepted offer found for this property" });
        }

        // 2. Insert payment entry
        const paymentEntry = {
          propertyId,
          email,
          amount,
          transactionId,
          paymentMethod,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date(),
        };

        const insertResult = await paymentsCollection.insertOne(paymentEntry);

        res.send({
          message: "Payment processed and recorded",
          updateResult,
          insertResult,
        });
      } catch (error) {
        console.error("Payment processing error:", error);
        res.status(500).send({ message: "Failed to process payment" });
      }
    });

    // get sold properties
    app.get("/sold-properties", async (req, res) => {
      try {
        const agentEmail = req.query.agentEmail;

        if (!agentEmail) {
          return res.status(400).json({ error: "Agent email is required" });
        }

        // Fetch only 'paid' offers by this agent
        const soldOffers = await offersCollection
          .find({ agentEmail, status: "paid" })
          .toArray();

        // Optionally format or rename fields
        const result = soldOffers.map((offer) => ({
          propertyId: offer.propertyId,
          title: offer.title,
          location: offer.location,
          soldPrice: offer.offerAmount,
          buyerName: offer.buyerName,
          buyerEmail: offer.buyerEmail,
          soldAt: offer.paid_at,
          status: offer.status,
        }));

        res.send(result);
      } catch (error) {
        console.error("Failed to fetch sold properties:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // stats card apis
    // admin stats card get api
    app.get("/api/admin-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.estimatedDocumentCount();
        const totalVerifiedProperties =
          await propertiesCollection.countDocuments({ status: "verified" });
        const totalPendingProperties =
          await propertiesCollection.countDocuments({ status: "available" });
        const totalRejectedProperties =
          await propertiesCollection.countDocuments({ status: "rejected" });
        const totalReviews = await reviewsCollection.estimatedDocumentCount();
        const totalVerifiedAgents = await usersCollection.countDocuments({
          role: "agent",
        });
        const totalAdvertisedProperties =
          await advertisementsCollection.countDocuments();
        const totalReportedProperties =
          await reportsCollection.countDocuments();

        res.json({
          totalUsers,
          totalVerifiedProperties,
          totalPendingProperties,
          totalRejectedProperties,
          totalReviews,
          totalVerifiedAgents,
          totalAdvertisedProperties,
          totalReportedProperties,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load admin stats" });
      }
    });

    // agent stats card get api
    app.get("/api/agent-stats", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const myAdded = await propertiesCollection.countDocuments({
          agentEmail: email,
        });
        const VerifiedProperties = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "verified",
        });
        const mySold = await offersCollection.countDocuments({
          agentEmail: email,
          status: "paid",
        });
        const unVerified = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "available",
        });
        const requested = await offersCollection.countDocuments({
          agentEmail: email,
          status: "pending",
        });
        const rejected = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "rejected",
        });

        res.json({
          myAdded,
          VerifiedProperties,
          mySold,
          unVerified,
          requested,
          rejected,
        });
      } catch (err) {
        console.error("Agent Stats Error", err);
        res.status(500).json({ error: "Failed to fetch agent stats" });
      }
    });

    // user stats card get api
    app.get("/api/user-stats", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        const wishlistCount = await wishlistCollection.countDocuments({
          userEmail: email,
        });

        const reviewCount = await reviewsCollection.countDocuments({
          userEmail: email,
        });

        const boughtCount = await offersCollection.countDocuments({
          buyerEmail: email,
          status: "paid",
        });

        res.json({
          wishlist: wishlistCount,
          reviews: reviewCount,
          bought: boughtCount,
        });
      } catch (err) {
        console.error("Failed to get user stats", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    //post on advertisement collection
    app.post("/properties/advertise/:id", async (req, res) => {
      const propertyId = req.params.id;

      try {
        // Find the property by ID and ensure it's admin verified
        const property = await propertiesCollection.findOne({
          _id: new ObjectId(propertyId),
          status: "verified",
        });

        if (!property) {
          return res
            .status(404)
            .json({ error: "Property not found or not verified by admin" });
        }

        // Check if already advertised
        const alreadyAdvertised = await advertisementsCollection.findOne({
          propertyId: propertyId,
        });

        if (alreadyAdvertised) {
          return res.status(409).json({ error: "Property already advertised" });
        }

        // Create advertisement entry
        const advertisementDoc = {
          propertyId: propertyId,
          title: property.title,
          image: property.image,
          location: property.location,
          maxRate: property.maxRate,
          minRate: property.minRate,
          status: property.status,
          installments: property.installments,
          createdAt: new Date(),
        };

        const result = await advertisementsCollection.insertOne(
          advertisementDoc
        );

        res.send({ modifiedCount: result.insertedId ? 1 : 0 });
      } catch (error) {
        console.error("Error advertising property:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Simple root route
app.get("/", (req, res) => {
  res.send("BrickBase Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
